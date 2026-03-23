export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { target, ...body } = req.body;

  // Route to Google Sheets
  if (target === 'sheets') {
    try {
      const r = await fetch('https://script.google.com/macros/s/AKfycby6zh68MVuWCVCkyJv5vmfqCUebtib1DK8cjtbTDRUhqeWjmVAlOR955UXx0lNrlZsm8Q/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await r.text();
      return res.status(200).json({ success: true, response: text });
    } catch(err) {
      return res.status(500).json({ error: 'Sheets error', detail: err.message });
    }
  }

  // Route to Anthropic
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch(err) {
    return res.status(500).json({ error: 'Proxy error', detail: err.message });
  }
}
