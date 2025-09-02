export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, predictionId, useControlNet = true, controlNetType = 'pose', highQuality = true } = req.body;

  try {
    if (predictionId) {
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      const prediction = await statusResponse.json();
      return res.json(prediction);
    }

    // Different ControlNet models for each type
    const controlNetModels = {
      pose: "jagilley/controlnet-pose:0a82aaa2e94e19a325869fcf47af8e51b1d0c4d7c6d2b3a8ed44f7f16fcb6b34",
      depth: "jagilley/controlnet-depth2image:0a73c0cf1e62a16e2b0a64b70ebc2e2d1b61f267d2b8b2a1e7fad3c4aadbb6e4", 
      canny: "jagilley/controlnet-canny:aff48af9c68d162388d230a2ab003f68d2638d88dc8f7e08e06c9e3cf3b13a7e"
    };

    const modelVersion = useControlNet 
      ? controlNetModels[controlNetType]
      : "stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478";

    const input = useControlNet ? {
      image: imageData,
      prompt: prompt,
      negative_prompt: "low quality, blurry, anime, cartoon, distorted",
      num_inference_steps: highQuality ? 30 : 20,
      guidance_scale: 7.5,
      controlnet_conditioning_scale: 1.0,
      structure: controlNetType
    } : {
      init_image: imageData,
      prompt: prompt,
      negative_prompt: "low quality, blurry, anime, cartoon",
      num_inference_steps: highQuality ? 30 : 20,
      guidance_scale: 7.5,
      prompt_strength: 0.75
    };

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: modelVersion, input: input })
    });

    const prediction = await response.json();
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
