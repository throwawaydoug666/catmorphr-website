export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, predictionId, useControlNet = false } = req.body;

  try {
    if (predictionId) {
      // Polling for existing prediction
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
      });
      return res.json(await statusResponse.json());
    }

    // Use your working model with Pony-style prompting
    const modelVersion = "stability-ai/stable-diffusion:27b93a2413e7f3dc683da926f365620b29355644f050bf95754f4df9bca7478";
    
    const input = {
      init_image: imageData,
      prompt: prompt,
      negative_prompt: "score_6, score_5, score_4, low quality, worst quality, blurry, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
      num_inference_steps: 20,
      guidance_scale: 4,
      prompt_strength: 0.75
    };

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: modelVersion,
        input: input
      })
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
