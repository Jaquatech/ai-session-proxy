/**
 * ai-session-proxy
 * Cloudflare Worker that proxies Grok share links via their public REST API,
 * returning clean JSON content for AI consumption.
 *
 * Usage:
 *   GET /ai-session-proxy/https://grok.com/share/{id}           → clean chat log
 *   GET /ai-session-proxy/https://grok.com/share/{id}?mode=full → chat log + sources
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

    return json({ error: 'Unsupported service. Supported: grok.com' }, 400);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
