export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { base64, mediaType, action, phone, osData } = req.body;

  // Envio WhatsApp
  if (action === 'notify_whatsapp') {
    try {
      const numero = phone.replace(/\D/g, '');
      const mensagem = `Olá ${osData.cliente}! 😊\n\nSua joia está pronta para retirada na *Garimpo Jóias*.\n\n📋 *OS ${osData.numero}*\n🔧 ${osData.descricao}\n\nEstamos aguardando sua visita!\n\n📍 (13) 3284-2485`;

      const zRes = await fetch(
        `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: numero, message: mensagem }),
        }
      );
      const zData = await zRes.json();
      return res.status(200).json({ ok: true, zapi: zData });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Leitura de OS por IA
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.VITE_ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `Analise esta OS da Garimpo Jóias e retorne SOMENTE JSON válido sem markdown: {"numero":"","cliente":"","fone":"","descricao":"","recepcao":"","data":"DD/MM/AAAA","ac":"","nc":"","obs":""}` }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    res.status(200).json(JSON.parse(clean));
  } catch {
    res.status(500).json({ error: 'Falha ao parsear resposta', raw: text });
  }
}
