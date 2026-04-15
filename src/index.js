/**
 * ai-session-proxy
 * Cloudflare Worker that proxies Grok share links via their public REST API,
 * returning clean JSON content for AI consumption.
 *
 * Usage:
 *   GET /ai-session-proxy/https://grok.com/share/{id}           → clean chat log (Grok special handling)
 *   GET /ai-session-proxy/https://grok.com/share/{id}?mode=full → chat log + sources
 *   GET /ai-session-proxy/https://example.com/any/path          → generic fetch with Chrome UA headers
 */

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const reqUrl = new URL(request.url);
    const fullMode = reqUrl.searchParams.get('mode') === 'full';
    const prefix = '/ai-session-proxy/';

    if (!reqUrl.pathname.startsWith(prefix)) {
      return json({
        error: 'Missing target URL.',
        usage: 'GET /ai-session-proxy/https://grok.com/share/{id}',
      }, 400);
    }

    const targetRaw = reqUrl.pathname.slice(prefix.length);

    let targetUrl;
    try {
      targetUrl = new URL(targetRaw.startsWith('http') ? targetRaw : 'https://' + targetRaw);
    } catch {
      return json({ error: 'Invalid target URL' }, 400);
    }

    if (targetUrl.hostname.endsWith('grok.com')) {
      return handleGrok(targetUrl, fullMode);
    }

    return handleGeneric(targetUrl);
  }
};

async function handleGrok(targetUrl, fullMode) {
  const shareMatch = targetUrl.pathname.match(/^\/share\/([^/?#]+)/);

  if (!shareMatch) {
    return json({
      error: 'Only Grok share links are supported.',
      usage: 'GET /ai-session-proxy/https://grok.com/share/{id}',
    }, 400);
  }

  const shareId = shareMatch[1];
  const apiUrl = `https://grok.com/rest/app-chat/share_links/${shareId}`;

  let response;
  try {
    response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ai-session-proxy/1.0)',
      }
    });
  } catch (err) {
    return json({ error: `Fetch failed: ${err.message}` }, 502);
  }

  if (!response.ok) {
    return json({ error: `Grok API returned ${response.status}` }, 502);
  }

  const data = await response.json();
  const title = data.conversation?.title || null;
  const responses = (data.responses || []).map(r => extractFields(r, fullMode));

  return json({
    source: `https://grok.com/share/${shareId}`,
    service: 'grok.com',
    mode: fullMode ? 'full' : 'default',
    title,
    conversation: responses,
  });
}

function extractFields(r, fullMode) {
  const base = {
    responseId: r.responseId,
    createTime: r.createTime,
    model: r.model,
    message: r.message,
  };

  if (!fullMode) return base;

  return {
    ...base,
    sender: r.sender,
    parentResponseId: r.parentResponseId || null,
    webSearchResults: r.webSearchResults || [],
    xpostIds: r.xpostIds || [],
    xposts: r.xposts || [],
  };
}

async function handleGeneric(targetUrl) {
  let response;
  try {
    response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      }
    });
  } catch (err) {
    return json({ error: `Fetch failed: ${err.message}` }, 502);
  }

  if (!response.ok) {
    return json({ error: `Target returned ${response.status}` }, 502);
  }

  const contentType = response.headers.get('Content-Type') || '';
  const body = await response.text();

  // Non-HTML: return raw content wrapped in JSON
  if (!contentType.includes('text/html')) {
    return json({ url: targetUrl.toString(), contentType, content: body });
  }

  // HTML: extract clean text for AI consumption
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
    : null;

  const content = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return json({ url: targetUrl.toString(), title, content });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
