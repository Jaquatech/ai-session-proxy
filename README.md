# ai-session-proxy

A Cloudflare Worker that proxies Grok share links via their public REST API, returning clean JSON content for AI consumption.

## Table of Contents

- [How it works](#how-it-works)
- [Supported Services](#supported-services)
- [Cloudflare Deployment](#cloudflare-deployment)
- [API](#api)
- [Claude Code Skill](#claude-code-skill)
- [Claude Web](#claude-web)
- [Adding more services](#adding-more-services)
- [License](#license)

---

## How it works

Grok share links are protected by a login wall in the browser, but served via a public REST endpoint under the hood. This Worker calls that endpoint directly and returns the conversation as JSON — no session cookies, no authentication needed.

```
AI Tool → GET /ai-session-proxy/https://grok.com/share/{id} → Worker → Grok REST API → JSON response
```

## Supported Services

- `grok.com` — Grok AI shared conversations

---

## Cloudflare Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A Cloudflare account with a domain pointed to Cloudflare DNS
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### 1. Clone and install

```bash
git clone https://github.com/Jaquatech/ai-session-proxy
cd ai-session-proxy
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser window to authorize Wrangler with your Cloudflare account.

### 3. Configure wrangler.toml

Fill in your values in `wrangler.toml`:

```toml
name = "ai-session-proxy"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"

[[routes]]
pattern = "yourdomain.com/ai-session-proxy*"
zone_name = "yourdomain.com"
```

To find your **Account ID**: Cloudflare Dashboard → right sidebar on any page.

To find your **Zone name**: your root domain, e.g. `yourdomain.com`.

> **Note:** If you have a catch-all redirect rule on your domain, update it to exclude `/ai-session-proxy*` so the Worker can handle those requests. In Cloudflare Redirect Rules, use a custom filter expression:
> ```
> (http.host eq "yourdomain.com" and not starts_with(http.request.uri.path, "/ai-session-proxy"))
> ```

### 4. Deploy

```bash
npm run deploy
```

### 5. Verify

```bash
# Default mode — clean chat log
curl "https://yourdomain.com/ai-session-proxy/https://grok.com/share/bGVnYWN5_5a59a2a9-0670-4259-880b-87bcf38174f5"

# Full mode — chat log + sources
curl "https://yourdomain.com/ai-session-proxy/https://grok.com/share/bGVnYWN5_5a59a2a9-0670-4259-880b-87bcf38174f5?mode=full"

# Chrome UA mode — mimic a real browser request
curl "https://yourdomain.com/ai-session-proxy/https://grok.com/share/bGVnYWN5_5a59a2a9-0670-4259-880b-87bcf38174f5?ua=chrome"
```

### Local development

```bash
npm run dev
```

Then test locally at `http://localhost:8787/ai-session-proxy/...`.

---

## API

### Default mode

```
GET /ai-session-proxy/https://grok.com/share/{id}
```

Returns the clean chat log — title, messages, timestamps, and model used.

```json
{
  "source": "https://grok.com/share/{id}",
  "service": "grok.com",
  "mode": "default",
  "title": "Conversation title",
  "conversation": [
    {
      "responseId": "...",
      "createTime": "2026-04-09T18:11:33Z",
      "model": "grok-4",
      "message": "The user question or Grok's answer..."
    }
  ]
}
```

### Full mode

```
GET /ai-session-proxy/https://grok.com/share/{id}?mode=full
```

Same as default, plus `sender`, `parentResponseId`, `webSearchResults`, `xpostIds`, and `xposts` on each response entry — all the research Grok used to build its answer.

### Chrome UA mode

```
GET /ai-session-proxy/https://grok.com/share/{id}?ua=chrome
```

Injects Chrome browser headers into the outbound request to Grok's API:

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Referer: https://www.google.com/
```

Useful if Grok starts blocking the default proxy User-Agent. Can be combined with `?mode=full&ua=chrome`.

---

## Claude Code Skill

The `skill/` folder contains a Claude Code plugin that automatically detects Grok share links in your conversation and fetches them through the proxy — no manual URL construction needed.

### Install

Copy the `skill/` folder to your Claude plugins directory and rename it to `grok-proxy`:

**macOS / Linux:**
```bash
cp -r skill ~/.claude/plugins/grok-proxy
```

**Windows:**
```powershell
Copy-Item -Recurse skill $env:USERPROFILE\.claude\plugins\grok-proxy
```

Then restart Claude Code.

### First use

On first use Claude will ask for your proxy base URL:

> "To fetch this Grok link I need your proxy base URL. What is your ai-session-proxy URL?"

Enter your deployed URL (e.g. `https://yourdomain.com/ai-session-proxy`). It is saved to memory and never asked again.

### Auto-trigger

Paste any `grok.com/share/` URL in Claude Code — the skill fires automatically:

```
https://grok.com/share/bGVnYWN5_5a59a2a9-0670-4259-880b-87bcf38174f5
```

Claude fetches the conversation and presents title, question, and answer.

### Manual command

```
/grok https://grok.com/share/{id}
/grok https://grok.com/share/{id} full
```

The `full` argument includes all web sources and X posts Grok referenced.

---

## Claude Web

Since the Worker removes the session requirement, Claude web (claude.ai) can fetch the proxy URL directly — no plugin needed.

### Option 1 — Paste the proxied URL directly

Construct the URL yourself and paste it into Claude web:

```
https://yourdomain.com/ai-session-proxy/https://grok.com/share/{id}
```

Claude web will fetch and read the full JSON response. Add `?mode=full` to include sources.

### Option 2 — Claude web Project instruction

Create a [Project](https://claude.ai) on claude.ai and add the following custom instruction:

```
When I share a grok.com/share/ URL, automatically prepend
https://yourdomain.com/ai-session-proxy/ to construct the proxy URL,
fetch its contents, and present the conversation title, question, and answer.
Add ?mode=full to include the web sources Grok referenced.
```

After that, paste any Grok share link in the Project chat and Claude web handles it automatically — same experience as the Claude Code skill.

---

## Adding more services

Add a new handler in `src/index.js` following the `handleGrok` pattern and route to it based on `targetUrl.hostname`.

---

## License

MIT
