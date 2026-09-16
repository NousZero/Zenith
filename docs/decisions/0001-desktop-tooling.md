# ADR 0001: Windows desktop shell and build tooling

**Status:** Accepted for M0 spike  
**Date:** 2026-08-11

## Context

Zenith needs a Windows desktop shell with a web-quality UI, controlled native capabilities, packaging, and testable process boundaries. The installed machine already has Node.js 24.17.0 and npm 11.17.0. Electron provides a Chromium renderer plus a Node-capable main process; Electron Forge provides development/package/make lifecycles.

Forge's Vite plugin is explicitly described as experimental and may introduce breaking changes in minor releases. That makes exact pins and an early package/E2E spike mandatory rather than optional.

## Decision

- Use Electron, Electron Forge, TypeScript, React, and the Forge Vite plugin for the M0 candidate.
- Pin exact package versions in T0010 and lock them. The registry candidates verified during planning are Electron 43.3.0, Forge packages 7.11.2, Vite 8.2.1, React 19.2.8, and TypeScript 7.0.2; T0010 must re-query and verify compatibility before authoring `package.json`.
- Do not use a generator/scaffolder. Author the minimal files so lifecycle execution and provenance remain visible.
- Configure separate Vite builds for main and preload plus one named renderer, matching Forge's documented structure.
- Package Windows with Forge and one explicitly selected Windows maker during M0. Maker choice is finalized with the dependency review; no publisher is configured.
- Apply production Electron fuses and verify them against the packaged artifact, not only source configuration.

## Fallback trigger

Before feature work, replace the Forge Vite plugin with Forge Webpack through a superseding ADR if any of these remains reproducible after one documented repair attempt:

- development and package resolve different entries or security policy;
- two clean package/E2E runs are not repeatable;
- required Electron/native modules cannot be externalized or packaged safely;
- a minor-version pin cannot be maintained without unreviewed lifecycle behavior; or
- the production CSP requires an unsafe relaxation caused by the bundler.

The fallback must keep the same source/process contracts and local command names.

## Alternatives

- **Forge Webpack first:** more mature but not the user's selected initial direction; retained as the bounded fallback.
- **Electron Builder:** capable packaging, but adds a second packaging model without a demonstrated need.
- **Tauri:** smaller runtime but changes the privileged backend language/ecosystem and does not directly preserve the requested Node/agent tooling model.
- **Browser-only/PWA:** cannot provide the required local filesystem, PTY, plugin, and desktop behavior with the same boundary model.

## Consequences

- M0 must prove development, package, make, CSP/fuses, and Electron E2E before feature code.
- Exact pins trade automatic upgrades for deliberate reviewed migrations.
- The Vite risk is visible and reversible; it is not hidden behind generated files.
- No macOS/Linux packaging or public signing is implied.

## Primary sources

- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron Forge Vite plugin and experimental status: https://www.electronforge.io/config/plugins/vite
- Electron Forge configuration overview: https://www.electronforge.io/config/configuration
- Electron Forge makers: https://www.electronforge.io/config/makers
- Electron fuses: https://www.electronjs.org/docs/latest/tutorial/fuses

## Revisit

At G0 after two clean E2E launches and a same-tree Windows package/make. Any fallback decision must update `PLAN.md`, the dependency review, and command evidence.
