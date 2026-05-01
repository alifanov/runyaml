# runyaml

Run YAML-defined DAG workflows from the command line, stream every step to a debug dashboard.

Each node is a shell command. Outputs (stdout) flow into downstream nodes via `{{ id.output }}`. Use it as a thin glue layer over coding-agent CLIs (`codex`, `opencode`, `claude`, …) — plan in one node, implement in another, validate in a third — and watch the whole graph live in the browser.

## Install

```bash
git clone https://github.com/<you>/runyaml.git
cd runyaml
pnpm install
npm install -g ./core           # exposes a global `runyaml` binary
```

(`pnpm install -g ./core` works too, but needs `pnpm setup` first.)

Verify:

```bash
runyaml --help
```

## Start the debug dashboard

The dashboard is a Next.js app + Postgres in a docker-compose. Postgres is **not** exposed to the host — only reachable from the web container.

```bash
pnpm web:up        # build + start (host port 4444 → container 3000)
pnpm web:logs      # tail logs
pnpm web:down      # stop
```

Open http://localhost:4444 — you'll see an empty list of runs.

## Point the CLI at the dashboard

`runyaml` requires `RUNYAML_DASHBOARD_URL` so it knows where to ship traces. Set it once per project via a `.env` file walked up from `cwd`, or export it globally:

```bash
# .env at the root of any project that runs workflows
RUNYAML_DASHBOARD_URL=http://localhost:4444
```

If the variable is missing, the CLI exits before running anything.

## Use it

Scaffold a `.runyaml/` directory in your project:

```bash
runyaml init
```

This drops two files inside `.runyaml/`:
- `hello.yaml` — a minimal two-node sample.
- `AGENTS.md` — the schema + authoring guide written for an LLM. Cat it into your coding agent's context whenever you ask it to draft a workflow.

Run a workflow — by name, relative path, or absolute path:

```bash
runyaml hello world                          # bare name, looked up in ~/.runyaml/ then ./.runyaml/
runyaml .runyaml/hello.yaml world            # relative path
runyaml /Users/me/.runyaml/hello.yaml world  # absolute path
```

Output:

```
▶ [1/2] greet
Hello, world
✓ [1/2] greet (62ms)
▶ [2/2] shout
Hello, world!
✓ [2/2] shout (50ms)
```

Open the dashboard — the run is there, tagged with the current directory's basename as **project**, with two tabs: **Tracing** (per-node command, captured stdout, duration, errors) and **Graph** (DAG laid out left-to-right).

`runyaml init` is idempotent — running it again refreshes `hello.yaml` and `AGENTS.md` so you always get the latest sample/docs after upgrading.

## Sharing workflows across projects

Once a workflow is dialed in, lift it out of one project so every other project can use it:

```bash
runyaml share .runyaml/feature-pipeline.yaml
# → copied to ~/.runyaml/feature-pipeline.yaml

# from any other project:
runyaml feature-pipeline "Add dark mode"
```

`~/.runyaml/` is the global workflow directory. Bare-name lookup checks it first, then falls back to the project's `./.runyaml/`. To see what's available:

```bash
runyaml list
```

Lists global workflows first, then project-local ones, with sizes and absolute paths.

## Workflow YAML

Minimal schema:

```yaml
nodes:
  - id: <unique-string>
    depends_on: [other-id, ...]   # optional
    run: <shell command>
```

Substitution inside `run:`:
- `{{ id.output }}` — captured stdout of an upstream node (escaped for `"..."` shell context).
- `{{ ARGUMENTS }}` / `{{ USER_MESSAGE }}` — the positional CLI message.

A real example chaining three coding agents (claude → opencode → claude):

```yaml
nodes:
  - id: plan
    run: |
      claude -p "Plan the following feature as a numbered task list, no preamble.
      Feature: {{ ARGUMENTS }}"

  - id: implement
    depends_on: [plan]
    run: |
      opencode run "Implement the plan in this repo. Don't commit. Summarize what changed.
      Plan:
      {{ plan.output }}"

  - id: validate
    depends_on: [implement]
    run: |
      claude -p "Run \`git diff\` and verify the changes match the plan. Output PASS or FAIL on the first line.
      Plan: {{ plan.output }}
      Implementation: {{ implement.output }}"
```

See `examples/` for more, and `.runyaml/AGENTS.md` (after `runyaml init`) for the full authoring guide.

## Layout

```
runyaml/
├── core/           # @runyaml/core — the CLI + runner (TypeScript, ESM)
├── web/            # @runyaml/web  — Next.js dashboard + docker-compose
├── examples/       # sample workflows
└── pnpm-workspace.yaml
```

## Development

```bash
pnpm install
pnpm -r typecheck         # both packages
pnpm --filter @runyaml/core run cli examples/hello.yaml   # dev run via tsx
pnpm --filter @runyaml/core run build                     # tsc → core/dist/
```

After editing dashboard code: `pnpm web:up` rebuilds the image. After editing the CLI: `cd core && pnpm build && npm install -g .` to refresh the global binary.
