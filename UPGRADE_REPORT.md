# Upgrade Report — Module SoloHost v1.3.0 → Calculator v1.5.0

Host: Futuristic Calculator (was v1.4.0 with module ~1.2.1)  
Module: universal-ai-feedback-modules-solohost **v1.3.0**  
Result app version: **1.5.0**

## Done

- [x] Replaced `lib/ai-module/{ai-service,provider-engine,routes}.js` from module 1.3.0
- [x] Replaced `lib/feedback-module/feedback-service.js`
- [x] Replaced client `public/ai-module/ai-module.js`, `public/feedback-module/feedback-module.js`
- [x] Replaced `public/ai-icon.png`, `public/ai-panel.css`, `public/ai-panel.js` (adapted context/actions for calculator)
- [x] Synced legacy `ai-module/` + `feedback-module/` trees + PROVIDERS.md, FEEDBACK_NOTICES, SECURITY
- [x] Kept `lib/app-adapter.js` (knowledge, whitelist actions, localReply) — no redesign
- [x] Kept calculator UI / `script.js` / `style.css` / `calc-engine` unchanged
- [x] Kept custom HTTP server + router bridge; mount paths unchanged
- [x] FAB + panel Chat|Feedback|Settings|Logs intact; Load models wired (`setModels` + legacy id)
- [x] `node --check` all JS
- [x] Tests: smoke, security, integration, provider-engine, provider-mock, **provider-custom-local (36)** — all OK
- [x] Live API: health, catalog (10 providers), feedback config (no ingest token), localReply chat, settings maskedKey, static assets 200

## Module 1.3.0 capabilities now in app

- Custom/Local Base URL normalisation (`/v1` probe, strip pasted `/chat/completions`)
- Tolerant `/models` shapes; Ollama `/api/tags` fallback
- Tolerant chat response extract (parts array, SSE, Responses API, Ollama native, `<think>` strip)
- Auto-adapt: drop temperature / fold system / drop max_tokens when server rejects
- Real generation probe on “Check token” for Custom/Local
- Clearer errors (connection refused, timeout, no model → type model name)
- Chat timeouts 60s cloud / 120s local

## Not changed (by design)

- Calculator buttons, display, `public/style.css` (app chrome)
- `lib/calc-engine.js` evaluation logic
- Docker / SoloHost packaging files
- Feedback Hub env contract (`SHFH_*` only when set)

## Forced adaptations (explained)

1. **`public/ai-panel.js`**: copied from module example then `gameContext` / `executeActions` bound to `window.calculatorAiContext` / `window.applyUniversalAiActions` (Snake room APIs do not exist on calculator).
2. **Tests paths**: module tests require `../lib/ai-module/...` instead of `../ai-module/server/...`.
3. **`package.json` version** → 1.5.0; test script includes `provider-custom-local.test.js`.

## Limitations

- Feedback Hub notices/donate still need reachable Hub + optional server-side `SHFH_INGEST_TOKEN`.
- Personal AI Hub as Custom base still requires a working Hub gateway token and active upstream keys on the Hub itself.
