export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body ?? {};
  const prompt = body.prompt;

  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt parameter!' });
    return;
  }

  try {
    const safePrompt = encodeURIComponent(
      `Crisp flat vector die-cut sticker graphic icon, solid isolated white background, bold clean stroke paths optimized for premium plotter vinyl decal cutting: ${prompt}`
    );
    const randomSeed = Math.floor(Math.random() * 1000000);
    const endpointUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&model=flux&seed=${randomSeed}&nologo=true`;
    const response = await fetch(endpointUrl, { headers: { Accept: 'image/jpeg' } });
    if (!response.ok) {
      throw new Error(`Pollinations request failed with ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    res.status(200).json({ success: true, image: `data:image/jpeg;base64,${base64Image}` });
  } catch (error) {
    console.error('AI generation failed', error);
    res.status(500).json({ error: 'Pollinations server is temporarily overloaded. Hit generate again to grab a fresh node!' });
  }
}
