---
description: Fetch a Grok shared conversation via ai-session-proxy and return the full content with sources
argument-hint: <grok_share_url> [full]
---

Fetch the Grok share link provided in the arguments using the grok-proxy skill.

Follow the grok-proxy skill steps exactly:
1. Check memory for the configured proxy URL (GROK_PROXY_URL)
2. If not found, ask the user for their ai-session-proxy base URL and save it to memory
3. Build the proxy URL: {GROK_PROXY_URL}/https://grok.com/share/{id}
4. If the argument includes "full", append ?mode=full to include sources
5. Fetch with WebFetch and present the conversation content
