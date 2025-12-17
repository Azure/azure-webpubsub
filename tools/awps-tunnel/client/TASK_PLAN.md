# Task Plan: Manual Data Fetcher & Standalone Client Mode

## Plan
- Add a ManualDataFetcher that seeds minimal ready state, stores a user-provided client URL (prefill from local storage), and exposes get/set helpers via invoke.
- Extend data fetcher selection (IDataFetcher) to include manual mode and surface fetcher kind for UI decisions.
- Update UI to support manual mode: allow editing/persisting client URL, and hide tunnel/service/server panels when manual is active.
- Keep playground clients (raw/subprotocol) working with manual URLs; ensure errors are handled and status updates still propagate.
- Add a build-time toggle path (env-based) and basic documentation hints in UI for manual usage.

## Self-Review (Q&A)
1) What is the acceptance path for manual mode? — Client-only experience with editable URL, successful connect/disconnect for raw and subprotocol clients, no tunnel/server dependencies.
2) How will users supply and persist the URL? — Editable input in UI, stored in localStorage, surfaced through ManualDataFetcher getters/setters.
3) How do we avoid breaking existing modes? — Keep default fetcher selection intact; manual mode only when `REACT_APP_DATA_FETCHER=manual`.
4) What testing is required? — Build with manual env, run playground, connect using portal URL, verify raw and subprotocol flow; sanity-check default build still renders.
5) Any edge cases to guard? — Empty URL should block connect; handle invalid URL errors gracefully; ensure status resets on disconnect.

## Checklist
- [x] ManualDataFetcher implemented and wired into getDataFetcher
- [x] UI detects manual mode and limits to client-only experience
- [x] Playground supports editable/persisted client URL (manual) while preserving existing behavior for socket/mock modes
- [x] Build/env toggle path verified (REACT_APP_DATA_FETCHER=manual)
- [x] Light documentation/hint for pasting client URL added in UI
- [x] Fullscreen toggle implemented with manual-mode default and manual-only toggle suppression
- [x] Manual connect flow mimics hosted sample (URL input + connect dialog) with deferred add-client button
