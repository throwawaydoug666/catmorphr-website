export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, predictionId, useControlNet = true, controlNetType = 'pose' } = req.body;

  try {
    if (predictionId) {
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      return res.json(await statusResponse.json());
    }

    // Use the working ControlNet model we know exists
    const modelVersion = useControlNet 
      ? "jagilley/controlnet-pose:0a82aaa2e94e19a325869fcf47af8e51b1d0c4d7c6d2b3a8ed44f7f16fcb6b34"
      : "stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478";

    const input = useControlNet ? {
      image: imageData,
      prompt: prompt,
      structure: controlNetType  // Keep this simple
    } : {
      init_image: imageData,
      prompt: prompt,
      prompt_strength: 0.75
    };

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: modelVersion, input })
    });

    return res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
