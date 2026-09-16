# ADR 0003: Windows-first runtime, ConPTY, and no elevation

**Status:** Accepted; M2 workspace boundary frozen
**Date:** 2026-08-11

## Context

The user selected a local-first Windows application. Terminal behavior, path identity, line endings, packaging, process trees, credential encryption, and accessibility must be verified on Windows rather than inferred from POSIX behavior.

The Windows pseudoconsole (ConPTY) hosts character-mode applications through explicit pipes and a created child process. Microsoft's documentation warns that synchronous channels can deadlock if not drained independently and describes resize and close behavior.

## Decision

- Windows 10/11 with ConPTY support is the MVP runtime target; exact minimum build is confirmed during the terminal milestone against the selected PTY library.
- Use a maintained Node PTY binding that uses ConPTY on supported Windows versions. Pin it exactly, review native install scripts, and package-test it before terminal feature work.
- Keep input/output draining independent, bound buffers, implement resize, and test close/cancel/process-tree behavior. Do not equate local cancellation with reversal of external effects.
- Never request UAC elevation. Zenith, terminals, plugins, and MCP processes run with the logged-in user's authority.
- Resolve executables explicitly for approval and record path/hash, arguments, cwd, environment-key names, PATH/PATHEXT implications, and shell/profile behavior.
- Centralize Windows workspace path authorization and test drive-letter case, UNC, extended-length/device namespaces, reserved names, ADS, symlink/junction/reparse, hardlink, and root-identity changes. Revalidate immediately before execution.
- Use UTF-8/LF repository defaults with explicit CRLF for Windows command scripts.

### M2 workspace boundary

G2 authorizes one existing regular text file beneath one explicitly selected local-drive directory. It does not authorize directory enumeration, network shares, device access, arbitrary absolute child paths, creation, rename, deletion, or multi-file behavior.

- Preserve the user-selected path only for display. Main derives the authority record from a native canonical root, local-volume and regular-directory facts, a case-insensitive comparison key, and stable filesystem identity fields. A string prefix is never authority.
- Accept a structurally valid relative child path only. Reject empty and absolute children, `.`/`..`, drive-relative forms, UNC, `\\?\` and `\\.\` namespaces, ADS colons, reserved device components, trailing dots/spaces, NUL/control characters, and any component that normalizes ambiguously.
- Inspect every existing component without intentionally following a link, reject symbolic links and junctions, and require the canonical target to remain contained by the canonical root. Hard-linked target files are unsupported in G2 and fail closed when the link count is not exactly one.
- Immediately before use, re-resolve and compare root/target identity and the proposal base hash. Open the target once for reading, inspect the opened handle, require an existing regular file within the byte limit, compare handle identity to the authorized target, then read and hash through that same handle. Discard bytes on any mismatch.
- Do not claim that Node's `O_NOFOLLOW` is a proven Windows primitive. The G2 control is component inspection plus native realpath and opened-handle identity checks. T0052 must prove the supported hostile fixtures; if the runtime cannot expose sufficient facts for a fixture, that fixture is denied rather than silently weakened.
- A same-user process can still race namespace or file state between observations. Detected drift fails closed; eliminating every Windows filesystem race requires a stronger native/OS boundary and is not a G2 claim.

## Alternatives

- **Pipe-only non-PTY execution:** insufficient for interactive shells, terminal resize, and programs that detect console semantics.
- **WSL-only terminal:** excludes normal Windows tools and changes workspace/path semantics; may be a future optional shell.
- **Administrator/elevated service:** rejected because it expands impact and complicates credential/trust boundaries.
- **Promise a workspace OS sandbox:** rejected; a same-user child process can access resources outside the selected folder.

## Consequences

- Terminal capability waits until its native dependency lifecycle and packaging are explicitly reviewed.
- Windows-hostile fixtures are release gates, not portability afterthoughts.
- G2 intentionally rejects valid but ambiguous Windows paths and hard-linked files; compatibility can widen only after new hostile-fixture evidence.
- The approval UI must disclose full current-user process authority.
- macOS/Linux support requires new runtime/path/PTY/package decisions.

## Primary sources

- Creating a pseudoconsole session: https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session
- Pseudoconsoles overview: https://learn.microsoft.com/en-us/windows/console/pseudoconsoles
- Windows file namespace naming: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
- Reparse points: https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points
- Hard links and junctions: https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions
- File streams and ADS naming: https://learn.microsoft.com/en-us/windows/win32/fileio/file-streams
- Node file handles, realpath, lstat/stat, and sync APIs: https://nodejs.org/docs/latest-v24.x/api/fs.html
- Process creation: https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags

## Revisit

At G2 after hostile workspace fixtures, at G5 before broad workspace mutation, at M7 before choosing the final PTY binding/process-tree strategy, and whenever the supported Windows minimum changes.
