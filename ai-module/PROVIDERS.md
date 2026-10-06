# Provider matrix

| Provider | Protocol | Key | Built-in Base URL | Model discovery |
|---|---|---|---|---|
| OpenAI | OpenAI-compatible | Yes | `https://api.openai.com/v1` | `GET /models` |
| Gemini | Native Gemini | Yes | `https://generativelanguage.googleapis.com/v1` | `GET /models` + `generateContent` capability filter |
| DeepSeek | OpenAI-compatible | Yes | `https://api.deepseek.com` | `GET /models` |
| Anthropic | Anthropic Messages | Yes | `https://api.anthropic.com/v1` | `GET /models` |
| OpenRouter | OpenAI-compatible | Yes | `https://openrouter.ai/api/v1` | `GET /models` |
| Groq | OpenAI-compatible | Yes | `https://api.groq.com/openai/v1` | `GET /models` |
| Mistral | OpenAI-compatible | Yes | `https://api.mistral.ai/v1` | `GET /models` |
| xAI | OpenAI-compatible | Yes | `https://api.x.ai/v1` | `GET /models` |
| Custom | OpenAI-compatible | Optional | User supplied | `GET <baseUrl>/models` |
| Local | OpenAI-compatible | Usually no | User supplied | `GET <baseUrl>/models` |

## Important

`model: auto` is **dynamic**. The module queries the provider's model list and selects a suitable text model. It does not trust a stale hard-coded model ID.

If a saved explicit model returns HTTP 404 / model-not-found, the module refreshes the provider model list, selects a valid fallback, retries once, and saves the recovered model.

Gemini uses the stable `v1` base URL by default. The model list is filtered to models advertising `generateContent` support. Google documents `v1` as the stable API version and the model list/generateContent APIs separately.
