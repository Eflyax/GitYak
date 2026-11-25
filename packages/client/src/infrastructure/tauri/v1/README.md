# Tauri 1 shims

The app is written against the Tauri 2 JS API. The build for older Linux (Ubuntu 20.04,
`src-tauri-v1`) runs on Tauri 1, so `vite build --mode tauri-v1` aliases each Tauri 2 module
the app imports to the shim here, which offers the same calls on top of `@tauri-apps/api@1`
(installed as `@tauri-apps/api-v1`). See the alias list in `vite.config.ts`.

When the app starts importing another Tauri 2 module or export, add it here too, or the
Tauri 1 build fails to resolve it.
