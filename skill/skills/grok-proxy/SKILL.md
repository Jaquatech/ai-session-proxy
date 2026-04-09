---
name: grok-proxy
description: This skill should be used whenever the user shares a grok.com URL, mentions a "grok share link", pastes a URL containing "grok.com/share", or asks to fetch/read/summarize a Grok conversation. Automatically fetches the full conversation content including all sources via the configured ai-session-proxy.
version: 1.0.0
---

# Grok Proxy Skill

Fetches Grok shared conversations through the ai-session-proxy and presents the content.

## Behavior

When a `grok.com/share/` URL appears in the conversation, run this skill automatically without waiting to be asked.

## Steps

### 1. Check for proxy URL configuration

Look in memory for a stored `GROK_PROXY_URL` value (stored by a previous run of this skill).

If no proxy URL is found in memory:
- Ask the user: "To fetch this Grok link I need your proxy base URL. What is your ai-session-proxy URL? (e.g. https://yourdomain.com/ai-session-proxy)"
- Wait for the user's answer
- Save it to memory as `grok_proxy_config.md` with type `reference` and the value as `GROK_PROXY_URL`
- Add a pointer to `MEMORY.md`

### 2. Build the proxy URL

Construct the fetch URL by appending the Grok share URL to the proxy base:

```
{GROK_PROXY_URL}/https://grok.com/share/{id}
```

For full mode (sources included), append `?mode=full`:

```
{GROK_PROXY_URL}/https://grok.com/share/{id}?mode=full
```

Use default mode unless the user explicitly asks for sources or full output.

### 3. Fetch the content

Use WebFetch on the constructed proxy URL with the prompt:
"Return the conversation title, the user's question, and Grok's full answer."

For full mode use the prompt:
"Return the conversation title, the user's question, Grok's full answer, and all cited web sources."

### 4. Present the result

Present the fetched content clearly:
- Conversation title
- The question asked to Grok
- Grok's full answer
- If full mode: list the cited sources

If WebFetch fails, tell the user the proxy URL that was used so they can verify it is deployed correctly.
