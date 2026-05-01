#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { parse } from 'yaml';
import { run, type Pipeline } from './runner.js';
import { createHttpTracer } from './tracer.js';

const SAMPLE_WORKFLOW = `# Minimal two-node workflow.
#
# Run as:   runyaml .runyaml/hello.yaml [name]
# Example:  runyaml .runyaml/hello.yaml world
#
# Demonstrates both substitution forms:
#   {{ ARGUMENTS }}   — the CLI message (empty if none)
#   {{ id.output }}   — captured stdout of an upstream node

nodes:
  - id: greet
    run: echo "Hello, {{ ARGUMENTS }}"

  - id: shout
    depends_on: [greet]
    run: echo "{{ greet.output }}!"
`;

const AGENTS_MD = `# runyaml — context for AI agents

\`runyaml\` runs YAML-defined DAG workflows from the command line. Each node
is a shell command. Node outputs (stdout) can be referenced by downstream
nodes via \`{{ id.output }}\`. The CLI streams every run to a debug
dashboard so you can inspect what each node produced.

This file is intentionally written for an LLM that may be asked to author
or modify a workflow. Read it end-to-end before editing or generating YAML.

## CLI

\`\`\`
runyaml init                       # create .runyaml/ in cwd with a sample
runyaml <path-to-yaml> [message]   # execute a workflow
runyaml run <path-to-yaml> [message]  # same, explicit form
\`\`\`

The optional positional \`message\` is exposed inside the workflow as
\`{{ ARGUMENTS }}\` (alias \`{{ USER_MESSAGE }}\`). Use it to pass the
user's intent — feature request, bug description, etc.

\`runyaml\` requires \`RUNYAML_DASHBOARD_URL\` to be set, either in the
environment or in a \`.env\` file walked up from the cwd. Without it the
CLI exits with an error before running anything.

## Workflow YAML — schema

\`\`\`yaml
nodes:
  - id: <unique-string>          # required, used in references
    depends_on: [other-id, ...]  # optional, ordering & graph edges
    run: <shell command>         # required for executable nodes
\`\`\`

- \`nodes\` is the only top-level field consumed by the runner.
- \`id\` must be unique within the workflow.
- \`depends_on\` is optional. The runner topo-sorts and fails on cycles
  or unknown ids. Transitive deps are inferred — declare only the direct
  predecessors a node actually consumes.
- \`run\` is a shell string, executed via \`/bin/sh -c\`. Multi-line: use
  YAML's \`|\` block scalar.

## Variable substitution

Two forms, evaluated in this order:

1. \`{{ <id>.output }}\` — captured stdout of an upstream node, with the
   trailing newline trimmed. The id must reference a node that runs
   before this one (transitively reachable through \`depends_on\`).
2. \`{{ ARGUMENTS }}\`, \`{{ USER_MESSAGE }}\` — the CLI \`message\` arg.
   Both resolve to the same string. Empty if no message was passed.

Substitution happens on the raw \`run:\` string before it is handed to
the shell. Substituted values are **escaped for double-quoted context**:
\`\\\`, \`"\`, \`$\`, and \`\\\`\` are backslash-escaped so an AI-generated
value containing backticks, dollars, or quotes cannot break out of a
\`"..."\` wrapper or trigger command substitution.

This means the safe pattern is:

\`\`\`yaml
run: some-cmd "{{ id.output }}"        # ✅ value is escaped for "..."
\`\`\`

If you splice \`{{ ... }}\` outside any quotes, word-splitting and glob
expansion still apply — wrap it.

Unknown ids in \`{{ ... }}\` raise an error and abort the run.

## Output capture

Each node's stdout is captured and stored. Stderr is streamed straight
to the terminal — useful for log lines from AI CLIs (codex, opencode)
that print progress to stderr and only the final answer to stdout.

Outputs are persisted to the dashboard, so even after the CLI exits you
can inspect what each node produced.

## Patterns for AI nodes

Most coding-agent CLIs already split progress (stderr) from final
answer (stdout), so they compose cleanly. Examples:

\`\`\`yaml
# OpenAI Codex (non-interactive)
- id: classify
  run: codex exec "Classify the following input as 'bug' or 'feature'. Reply with one word. Input: {{ ARGUMENTS }}"
\`\`\`

\`\`\`yaml
# OpenCode
- id: implement
  depends_on: [plan]
  run: |
    opencode run "Implement this plan in the current repo. Do not commit. Summarize what changed.

    Plan:
    {{ plan.output }}"
\`\`\`

\`\`\`yaml
# Claude Code (non-interactive). Note: requires auth in the shell that runs runyaml.
- id: review
  depends_on: [implement]
  run: |
    claude -p "Review the uncommitted changes against the plan. Run \\\`git diff\\\` first.

    Plan: {{ plan.output }}
    Implementation summary: {{ implement.output }}"
\`\`\`

## Authoring guidelines

- Prefer narrow, single-purpose nodes. A long pipeline of small nodes
  gives better observability than one fat shell script.
- Tell each AI node to output **only** what the next node needs. Wrap
  prompts with phrases like *"Output just the answer, no preamble."*
- For structured handoff, ask the AI to emit JSON and parse it in a
  later \`run:\`-style node with \`jq\`. (Native JSON-Schema output is
  not yet wired in this version.)
- When a node needs both another node's output and the original message,
  reference both explicitly: \`{{ plan.output }}\` and
  \`{{ ARGUMENTS }}\`.
- Keep \`depends_on\` minimal — list only the nodes whose output is
  actually substituted into this node's command. Transitive deps are
  resolved by the topo-sorter.
- One workflow file = one task class. Use \`runyaml init\` once per
  project to scaffold \`.runyaml/\`, then add YAML files as needed.

## Failure semantics

- A node fails when its shell command exits non-zero. The run is
  aborted, the failed node is marked \`failed\` in the dashboard, and
  the run itself transitions to \`failed\` (never stuck on \`running\`).
- Cycles, duplicate ids, unknown \`depends_on\` ids, and unknown
  \`{{ ... }}\` references are detected before execution and abort the
  run with a clear error.

## File layout after \`runyaml init\`

\`\`\`
.runyaml/
  AGENTS.md      # this file
  hello.yaml     # sample workflow
\`\`\`

Add your own workflows alongside \`hello.yaml\`. They can live anywhere
on disk — \`.runyaml/\` is just a convention.
`;

const argv = process.argv.slice(2);

if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
  printUsage();
  process.exit(argv.length === 0 ? 1 : 0);
}

if (argv[0] === 'init') {
  initWorkspace();
  process.exit(0);
}

// Default subcommand: run a workflow.
// Both `runyaml <path>` and `runyaml run <path>` are accepted.
const runArgs = argv[0] === 'run' ? argv.slice(1) : argv;
runWorkflow(runArgs);

function printUsage(): void {
  process.stderr.write(
    [
      'usage:',
      '  runyaml init                      Create .runyaml/ in the current directory',
      '  runyaml [run] <path-to-yaml> [message]   Execute a workflow',
      '',
      'Requires RUNYAML_DASHBOARD_URL in env or in a .env walked up from cwd.',
      '',
    ].join('\n'),
  );
}

function initWorkspace(): void {
  const dir = resolve(process.cwd(), '.runyaml');
  if (existsSync(dir)) {
    process.stderr.write(`.runyaml/ already exists at ${dir}\n`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'hello.yaml'), SAMPLE_WORKFLOW);
  writeFileSync(join(dir, 'AGENTS.md'), AGENTS_MD);
  process.stdout.write(
    [
      `Created ${dir}`,
      `  · hello.yaml — sample workflow`,
      `  · AGENTS.md  — context for AI agents (feed this to your coding agent)`,
      ``,
      `Run it with:`,
      `  runyaml .runyaml/hello.yaml`,
      ``,
    ].join('\n'),
  );
}

function runWorkflow(args: string[]): void {
  loadDotEnv();

  const file = args[0];
  const message = args.slice(1).join(' ');

  if (!file) {
    printUsage();
    process.exit(1);
  }

  const dashboardUrl = process.env.RUNYAML_DASHBOARD_URL?.trim();
  if (!dashboardUrl) {
    process.stderr.write(
      'RUNYAML_DASHBOARD_URL is not set. Add it to .env (see .env.example) or export it.\n',
    );
    process.exit(1);
  }

  const userCwd = process.env.INIT_CWD ?? process.cwd();
  const pipelinePath = resolve(userCwd, file);
  const project = basename(userCwd);
  const pipeline = parse(readFileSync(pipelinePath, 'utf8')) as Pipeline;
  const tracer = createHttpTracer(dashboardUrl);

  void run(pipeline, {
    globals: { ARGUMENTS: message, USER_MESSAGE: message },
    tracer,
    pipelinePath,
    project,
  }).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

function loadDotEnv(): void {
  let dir = process.env.INIT_CWD ?? process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const text = readFileSync(candidate, 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
