# Upgrade Report — Universal AI + Feedback SoloHost v1.2.1

App: Futuristic Calculator  
Module: universal-ai-feedback-modules-solohost v1.2.1  
Result version: 1.4.0

## Done (checklist)

- [x] Copied `ai-service.js`, `provider-engine.js`, `routes.js` → `lib/ai-module/`
- [x] Copied `feedback-service.js` → `lib/feedback-module/`
- [x] Copied client `ai-module.js`, `feedback-module.js` → `public/...`
- [x] Copied `assets/ai-icon.png` → `public/ai-icon.png`
- [x] Copied `ai-panel.css` → `public/ai-panel.css`
- [x] Adapted `ai-panel.js` → `public/ai-panel.js` (calculator context/actions)
- [x] Created `lib/app-adapter.js` (knowledge, actions whitelist, getContext, executeAction, localReply)
- [x] Server mounts AI + Feedback via lib paths; env SHFH_* only when set
- [x] FAB `id=aiFab` + badge `id=aiBadge` + panel tabs Chat|Feedback|Settings|Logs
- [x] Scripts order: ai-module → feedback-module → script.js → ai-panel.js
- [x] Removed old `ai-widget` UI and dual AI systems
- [x] GET `/api/feedback/config` has hubId+appId; no `cannoi_` / ingestToken in response
- [x] GET `/api/ai/catalog` lists openai,gemini,deepseek,anthropic,openrouter,groq,mistral,xai,custom,local
- [x] POST `/api/ai/chat` without key returns localReply (`ok:true`, `source:local`)
- [x] POST `/api/ai/settings` saves and returns `maskedKey`
- [x] Badge hidden when unread=0; FAB hidden while panel open (CSS `[hidden]`)
- [x] Donate only from sync (no hard-coded accounts in UI source)
- [x] Calculator UI/business logic unchanged (additive FAB + panel only)
- [x] `node --check` on all new/changed JS
- [x] Tests: smoke, security, integration, provider-engine, provider-mock — all OK

## Files changed / added

| Path | Action |
|------|--------|
| lib/ai-module/* | NEW (from module package) |
| lib/feedback-module/feedback-service.js | NEW |
| lib/app-adapter.js | NEW |
| public/ai-module/ai-module.js | REPLACED |
| public/feedback-module/feedback-module.js | REPLACED |
| public/ai-icon.png | NEW |
| public/ai-panel.css | NEW |
| public/ai-panel.js | NEW (adapted) |
| public/index.html | UPDATED (FAB+panel markup, scripts, css link) |
| public/script.js | UPDATED (expose context/actions; removed widget bootstrap) |
| server.js | UPDATED (lib paths, fbOpts env guards, query parsing) |
| tests/* | UPDATED for new layout |
| FEEDBACK_NOTICES.md, SECURITY.md | UPDATED from module |
| package.json | version → 1.4.0 |

## Removed / no longer served

- `public/ai-module/client/ai-widget.js`, `ai-widget.css`
- `public/ai-module/assets/ai-icon.png` (icon now at `/ai-icon.png`)
- Old widget bootstrap in `script.js`

## Forced changes outside pure “copy files”

1. **Custom HTTP server** (not Express): kept the existing dependency-free router bridge; added `req.query` parsing so Feedback `sync?anonymous_id=` works.
2. **`lib/app-adapter.js`**: extracted from previous inline adapter in `server.js` and added required `localReply` offline guide for the calculator.
3. **`public/ai-panel.js`**: `gameContext` / `executeActions` adapted to call `window.calculatorAiContext` / `window.applyUniversalAiActions` instead of Snake room/screen APIs.
4. **Tests**: paths and expectations updated to SoloHost panel layout; provider tests synced to module v1.2.1 behavior (e.g. gemini auto model).

## Limitations

- Feedback Hub sync/notices/donate require reachable Hub + optional `SHFH_INGEST_TOKEN` env (server-side only). Without Hub, Feedback tab still loads; sync returns 502 gracefully.
- Clearing API key via empty string is ignored by design (module only overwrites key when non-empty and not masked). Set provider to `none` to disable cloud.
- Legacy folders `ai-module/` and `feedback-module/` at repo root still contain copies for documentation parity; runtime uses `lib/*` and `public/*` only.

## Not changed (as required)

- Calculator UI, buttons, styles, `lib/calc-engine.js` behavior
- Docker / SoloHost packaging files (paths remain valid for static public/)
