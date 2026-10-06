# SECURITY CONTRACT

## Secrets

- AI API keys remain server-side.
- Feedback ingest token remains server-side.
- `/api/ai/settings` returns only `hasKey` + masked key.
- API keys are never added to AI prompts or logs.
- Gemini key is sent through `x-goog-api-key`, not query string.
- Feedback token is never returned by `publicConfig()`.

## Routes

The host should protect `/api/ai/*` and `/api/logs` with its existing authentication. `mountAIRoutes()` supports an `authorize(req)` hook.

Example:

```js
mountAIRoutes(app, ai, {
  authorize: req => req.user?.authenticated === true
});
```

## Actions

The model can only propose names that are present in the server-side action registry.

Host code must validate arguments again.

Never expose:

- shell
- Docker
- arbitrary code execution
- arbitrary outbound URL fetch
- filesystem secrets
- environment secrets
- credentials

Destructive actions must require explicit confirmation.

## Base URL

Settings reject embedded URL credentials and non-http(s) protocols. Cloud/custom endpoints should use HTTPS; HTTP is permitted only for local endpoints.

## Rate limiting

AI chat has a default in-memory limit of 30 requests/client/minute. The host can change or disable it through route options.

## Feedback

The supplied Feedback Hub token is a server credential. If the module/source is published or broadly shared, rotate the token and replace the server configuration.

## Privacy

The widget keeps short recent chat history in memory in the browser. It does not persist full AI conversations by default.

Feedback offline queue can temporarily store unsent feedback in browser localStorage. It never stores API keys or Hub tokens.
