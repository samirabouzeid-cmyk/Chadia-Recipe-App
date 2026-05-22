exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const prompt = String(body.prompt || '').trim();
    const image = body.image || '';
    const requestedModel = String(body.model || '').trim();
    if (!prompt) return json(400, { error: 'Missing prompt' });

    if (process.env.OPENAI_API_KEY) {
      const text = await callOpenAI(prompt, image, requestedModel || process.env.OPENAI_MODEL || 'gpt-4o-mini');
      return json(200, { text });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const text = await callAnthropic(prompt, image, requestedModel || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest');
      return json(200, { text });
    }

    return json(500, { error: 'No AI key configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Netlify environment variables.' });
  } catch (err) {
    return json(500, { error: err.message || 'AI request failed' });
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}
function json(statusCode, data) {
  return { statusCode, headers: cors(), body: JSON.stringify(data) };
}

async function callOpenAI(prompt, image, model) {
  const content = image ? [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: image } }
  ] : prompt;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful cooking assistant. Return clean, practical answers. If asked for JSON, return only valid JSON.' },
        { role: 'user', content }
      ],
      temperature: 0.4
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt, image, model) {
  const content = image ? [
    { type: 'text', text: prompt },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: (image.match(/^data:(.*?);base64,/) || [])[1] || 'image/jpeg',
        data: image.split(',')[1]
      }
    }
  ] : prompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2200,
      messages: [{ role: 'user', content }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic error ${res.status}`);
  return (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
}
