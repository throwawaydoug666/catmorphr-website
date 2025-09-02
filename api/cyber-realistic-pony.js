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

    // CyberRealistic Pony optimized settings
    const modelVersion = "aisha-ai-official/cyber-realistic-pony-v8";
    
    const input = {
      image: imageData,
      prompt: prompt,
      negative_prompt: "score_6, score_5, score_4, source_pony, source_anime, source_furry, source_cartoon, worst quality, low quality, normal quality, lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
      num_inference_steps: 20,
      guidance_scale: 4,
      strength: 0.75,
      scheduler: "DPMSolverMultistepScheduler", // DPM++ SDE Karras equivalent
      width: 512,
      height: 512,
      num_outputs: 1,
      seed: Math.floor(Math.random() * 1000000),
    };

    // Add ControlNet if requested
    if (useControlNet) {
      input.controlnet_conditioning_scale = 1.0;
      input.control_guidance_start = 0.0;
      input.control_guidance_end = 1.0;
    }

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
