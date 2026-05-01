# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

`runyaml` runs automation scripts defined in YAML, executing steps as a DAG (directed acyclic graph). It ships with a Next.js dashboard for visualizing the graph, debugging runs, and observing execution.

The repo is currently empty — this file describes the intended structure so future work stays consistent. Update this file as real conventions emerge.

## Planned layout

Monorepo with two top-level workspaces:

- **`core/`** — execution engine. Parses YAML definitions, builds the DAG, schedules step execution honoring dependencies, and emits run/step events (status, logs, timings, inputs/outputs) that the UI consumes. This is the source of truth for execution semantics — the web app should never re-implement scheduling or DAG logic.
- **`web/`** — Next.js dashboard. Renders the DAG, lets the user inspect a run, and surfaces debug/observability data. Uses Route Handlers (`app/api/**/route.ts`) for any data mutations or API endpoints (per global preference, not Server Actions).

Treat `core` as a library that `web` depends on. Keep YAML parsing, DAG construction, and step execution out of `web/`.

## Conventions

- Package manager: `pnpm` (use `pnpm add -S` to add deps, `pnpm exec <bin>` instead of `npx`).
- Before committing, run the build (`pnpm build` or workspace equivalent) to surface type/build errors.
