# M0 Dependency Review

**Status:** Scripts-disabled graph reviewed; one explicit Electron binary helper approval pending T0012  
**Registry query:** 2026-08-11 against `https://registry.npmjs.org/`  
**Runtime pin:** Node.js 24.17.0, npm 11.17.0  
**Policy:** exact stable versions, npm only, `ignore-scripts=true`

## Selection rules

- Direct specifications must be a numeric `major.minor.patch` with no range, tag, alias, git, file, URL, or workspace protocol.
- Root package is private and declares no install lifecycle script.
- The root has one npm lock boundary; competing/nested package roots are rejected.
- Initial resolution must use `npm install --ignore-scripts` while `.npmrc` also sets `ignore-scripts=true`.
- Registry metadata is not sufficient to approve lifecycle code. T0011 must inspect the resolved lock/tarball tree and exact installed package scripts/integrity.
- No provider SDK, SQLite library, PTY/native terminal binding, Monaco, xterm, or plugin SDK is pulled into M0 before its vertical slice needs it.
- Three explicit flat overrides are security/verification exceptions that must pass G0 rebuild/package tests:
  - replace `@electron/rebuild` 3.7.2's Git dependency on Electron's node-gyp fork with registry-published `@electron/node-gyp` 10.2.0-electron.1 so the artifact has registry SHA-512 integrity;
  - replace vulnerable transitive `tar` 6.2.1 with fixed registry `tar` 7.5.22; and
  - replace vulnerable transitive `tmp` with fixed registry `tmp` 0.2.7.

## Production dependencies

| Package | Exact version | Purpose | License | Initial risk/disposition |
|---|---:|---|---|---|
| `react` | 19.2.8 | Renderer component model | MIT | Bundled into local renderer; no install script reported by registry metadata |
| `react-dom` | 19.2.8 | Renderer DOM root | MIT | Registry metadata has a development `start` script, not approval to run anything; inspect resolved package |

## Desktop build and packaging

| Package | Exact version | Purpose | License | Initial risk/disposition |
|---|---:|---|---|---|
| `electron` | 43.3.0 | Chromium/Node desktop runtime | MIT | Runtime binary acquisition/execution is consequential; keep scripts disabled, inspect resolved package and download path, then request approval |
| `@electron-forge/cli` | 7.11.2 | Local dev/package/make command | MIT | Trusted build tool, invoked only by explicit npm command after review |
| `@electron-forge/plugin-vite` | 7.11.2 | Separate main/preload/renderer builds | MIT | Officially experimental; exact pin and G0 fallback gate |
| `@electron-forge/maker-zip` | 7.11.2 | Simple Windows ZIP distributable for M0 | MIT | Chosen over an installer to minimize native/setup complexity; installer reconsidered at release ADR |
| `@electron-forge/plugin-fuses` | 7.11.2 | Apply Electron fuses during packaging | MIT | Mutates packaged runtime intentionally; verify final artifact |
| `@electron-forge/shared-types` | 7.11.2 | Type-check Forge configuration | MIT | Type-only direct dependency; pinned with Forge family |
| `@electron/fuses` | 1.8.0 | Fuse definitions/inspection | MIT | Latest 1.x selected because Forge plugin 7.11.2 declares peer `^1.0.0`; determine installed lifecycle behavior before allowing anything |
| `vite` | 8.2.1 | Bundler/dev server | MIT | Node engine matches local runtime; transitive native helpers commonly require install handling, to inventory in T0011 |
| `@vitejs/plugin-react` | 6.0.5 | React JSX/refresh transform | MIT | Optional compiler peers not selected; only standard transform path |

## TypeScript, lint, and formatting

| Package | Exact version | Purpose | License | Initial risk/disposition |
|---|---:|---|---|---|
| `typescript` | 5.9.3 | Stable compiler | Apache-2.0 | Selected instead of 7.0.2 because `typescript-eslint` 8.67.0 declares support below 6.1 |
| `@types/node` | 24.13.3 | Types aligned to Node 24 family | MIT | Avoids incorrectly targeting Node 26 APIs |
| `@types/react` | 19.2.18 | React types | MIT | Matches React 19 family |
| `@types/react-dom` | 19.2.4 | React DOM types | MIT | Matches React DOM 19 family |
| `eslint` | 10.8.1 | Static checks and import restrictions | MIT | Node engine matches local runtime |
| `@eslint/js` | 10.0.1 | Core flat-config rules | MIT | Exact ESLint 10-compatible config package |
| `typescript-eslint` | 8.67.0 | TypeScript parser/rules | MIT | Peer range accepts ESLint 10 and TypeScript 5.9.3 |
| `eslint-plugin-react-hooks` | 7.1.1 | React hook correctness | MIT | Test/build scripts are package-development metadata; installed lifecycle inventory still required |
| `eslint-plugin-react-refresh` | 0.5.4 | Safe refresh export rules | MIT | Dev-only static plugin |
| `globals` | 17.9.0 | Explicit process/browser globals | MIT | Registry metadata includes `prepare`; inspect installed lifecycle behavior |
| `prettier` | 3.9.6 | Deterministic formatting check | MIT | No registry install script reported |

## Test dependencies

| Package | Exact version | Purpose | License | Initial risk/disposition |
|---|---:|---|---|---|
| `vitest` | 4.1.10 | Unit/integration/component/security runner | MIT | Peer-compatible with Vite 8 and Node 24 |
| `@vitest/coverage-v8` | 4.1.10 | Coverage reporting | MIT | Exact match to Vitest required |
| `jsdom` | 30.0.1 | Component DOM environment | MIT | Node 24.17 satisfies engine; registry metadata includes prepare/test setup, so inspect installed lifecycle fields |
| `@testing-library/dom` | 10.4.1 | Accessible DOM queries | MIT | Explicit peer of React Testing Library |
| `@testing-library/react` | 16.3.2 | React component tests | MIT | Peer-compatible with React 19; registry metadata scripts are not automatically allowed |
| `@testing-library/jest-dom` | 7.0.1 | DOM assertions through Vitest entry | MIT | Node >22 requirement satisfied |
| `@playwright/test` | 1.62.1 | Electron E2E harness/test runner | Apache-2.0 | Browser/binary behavior and Electron experimental API must be proven; no download or launch before reviewed install |

## Excluded alternatives for M0

- Forge Webpack remains the ADR fallback rather than a second installed bundler.
- Squirrel/NSIS installer makers wait until release requirements justify their setup/native surface; M0 makes a ZIP.
- `better-sqlite3`, `node-pty`, Monaco, xterm, Zod, provider SDKs, and plugin/MCP SDKs wait for the milestone that tests their behavior.
- No all-in-one framework, telemetry SDK, cloud backend SDK, updater, publisher, or environment loader.

## Registry and primary documentation

- npm package metadata queried with `npm view <package> version license engines peerDependencies scripts`.
- npm scripts/ignore policy: https://docs.npmjs.com/cli/v11/using-npm/scripts and https://docs.npmjs.com/cli/v11/commands/npm-install
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- Forge Vite: https://www.electronforge.io/config/plugins/vite
- Forge ZIP maker: https://www.electronforge.io/config/makers/zip
- Playwright Electron: https://playwright.dev/docs/api/class-electron

## T0011 required additions

After scripts-disabled resolution, append:

1. `package-lock.json` SHA-256, lockfile version, registry hosts, and direct-version comparison.
2. Every transitive package with `preinstall`/`install`/`postinstall` or other install-relevant behavior, exact version/integrity, resolved script text/source/hash, why needed, and allow/deny proposal.
3. Electron/Playwright/native binary acquisition behavior and expected artifact/source.
4. Unexpected registry/protocol, duplicate-version, deprecated, engine, peer, audit, provenance, and license findings.
5. The exact T0012 user-facing approval list. No listed script runs before that approval.

## Resolution note

The first scripts-disabled resolver attempt failed safely with `ERESOLVE`: `@electron-forge/plugin-fuses` 7.11.2 requires peer `@electron/fuses ^1.0.0`, while the initial metadata draft selected registry-latest 2.1.3. No lockfile or dependency directory was produced. Registry metadata confirmed 1.8.0 as the latest compatible 1.x release, so the direct pin was corrected without `--force` or `--legacy-peer-deps`.

The next clean scripts-disabled resolution completed but npm warned that `@electron/rebuild` 3.7.2 referenced `@electron/node-gyp` through `git+ssh://git@github.com/electron/node-gyp.git#06b29a...`, so npm could not apply registry integrity verification. This violates the registry-only policy. The tree/lock is being regenerated with the exact registry override above; the unapproved Git source will not be retained.

That intermediate lock's `npm audit --json` reported 24 findings (one critical, 20 high, three low). The critical/high chain was dominated by `tar` 6.2.1 under Forge/rebuild/node-gyp; `tmp` also had a high path-traversal advisory. The intermediate lock/tree is rejected and will be deleted. Exact fixed overrides use `tar` 7.5.22 (Node >=18, SHA-512 registry integrity) and `tmp` 0.2.7 (Node >=14.14, SHA-512 registry integrity). Because `tar` crosses a major version outside parent-declared ranges, G0 package/rebuild behavior is a blocking compatibility test rather than an assumed success.

## Final scripts-disabled resolution

The rejected/partial trees and their locks were removed from the exact verified workspace target before the final clean resolution. The accepted scripts-disabled result is:

| Field | Result |
|---|---|
| Command | `npm install --ignore-scripts --package-lock=true --no-audit --no-fund` |
| Added packages | 693 |
| Lock format / entries | version 3 / 719 package entries |
| Lock SHA-256 | `11BCC11327E7380B93C1C339D9461504181B41B1AB0F3A52B88A08FD439B7927` |
| Registries | only `registry.npmjs.org` |
| Non-registry resolutions | 0 |
| Resolved artifacts missing integrity | 0 |
| Direct declared/locked/installed mismatches | 0 of 29 |
| `npm ls --depth=0` | exit 0 |
| `npm audit --json` | exit 0; 0 total vulnerabilities |
| Deprecated transitive packages | 8; recorded below, not treated as security-cleanliness proof |

The final tree resolves the three explicit overrides as:

- `@electron/node-gyp` 10.2.0-electron.1 from the npm registry;
- `tar` 7.5.22 throughout rebuild/node-gyp/cacache; and
- `tmp` 0.2.7 under external-editor.

G0 package/rebuild tests remain blocking because these override parent-declared ranges/source. A green audit does not replace behavior testing.

### Lifecycle inventory

`node scripts/audit-resolved-dependencies.mjs` reads the final lock and every installed package manifest, and emits package name/version, integrity, package-manifest SHA-256, lifecycle command text, and command SHA-256.

- Installed packages containing `preinstall`, `install`, or `postinstall`: **0**.
- Installed packages containing package-development `prepare`: **69**. Each lock entry says `hasInstallScript: false`; npm does not need these source-build scripts for the published registry artifacts. They remain denied/unexecuted.
- Lock entries with `hasInstallScript: true`: optional macOS-only `fsevents` 2.3.2 and 2.3.3. Neither package is installed on this Windows tree; neither is required or approved.
- Playwright browser downloads: not run and not required for the M0 Electron-only harness.
- Root package lifecycle scripts: none.

### Deprecation inventory

Eight transitive packages carry deprecation messages: `glob` 8.1.0 in two locations, `glob` 7.2.3, `@npmcli/move-file` 2.0.1, `boolean` 3.2.0, `inflight` 1.0.6, `lodash.get` 4.4.2, and `rimraf` 3.0.2. They are dev/build-path dependencies. They do not produce current npm advisories after the security overrides, but remain technical debt to reassess when Forge updates or the ADR fallback is considered.

## T0012 exact approval proposal

Only one executable setup action is required before Electron development/package tests:

| Field | Exact value |
|---|---|
| Package | `electron@43.3.0` |
| Package integrity | `sha512-nLlvu0WFjftWsSaTkV2B/c4NDuJBspTyXu8vKSQ6vLvFt8uG3NgN49LLKcXddwX0GqVvAQDhciWp+4xOdTdhew==` |
| Command | `node node_modules/electron/install.js` |
| `install.js` SHA-256 | `5A83199076AE20CFE57576A984E31B92890A2AE4E0759454BB6DF4F9E7F47460` |
| `checksums.json` SHA-256 | `3CC7D8C0E3822E924B1C20CA300581A128C81F3EC846372063A8F7AA3625F1A9` |
| Expected archive | `electron-v43.3.0-win32-x64.zip` |
| Expected archive SHA-256 | `18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9` |
| Network/effect | Download/cache official Electron archive if absent, verify bundled checksum, extract under `node_modules\electron\dist`, write `path.txt` |
| Why required | Forge development, E2E launch, package, and make need the Electron runtime binary |
| Current state | `dist` and `path.txt` absent; helper not run |
| Manual approval digest | `SHA256:9B591B1CE839914CBEC1A859D10F942848BEB4D831FDC7B074E0B7F24CE2F6AF` |

This is an explicit helper, not an npm lifecycle allow-all. `.npmrc` remains `ignore-scripts=true`; no other dependency script is approved. Changing `package-lock.json`, the Electron package/integrity, either source hash, platform/architecture, archive checksum, or command invalidates approval.
