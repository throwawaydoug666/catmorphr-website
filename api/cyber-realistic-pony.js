export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, predictionId, useControlNet = true, controlNetType = 'openpose', strength = 0.4 } = req.body;

  try {
    if (predictionId) {
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      return res.json(await statusResponse.json());
    }

    // For now, use your working stable diffusion model for all transformations
    // The controlNetType selection will be ready for when we get proper ControlNet access
    const modelVersion = "stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478";
    
    const input = {
      init_image: imageData,
      prompt: prompt,
      negative_prompt: "(blurry:1.4), (out of focus:1.3), (soft focus:1.3), (low resolution:1.2), (pixelated:1.2), (low quality:1.3), (worst quality:1.4), (bad quality:1.2), (jpeg artifacts:1.2), (compression artifacts:1.2), (grainy:1.1), (noise:1.1), score_6, score_5, score_4, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
      num_inference_steps: 30,
      guidance_scale: 4,
      prompt_strength: parseFloat(strength)
    };

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: modelVersion, input })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    return res.json(await response.json());
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
