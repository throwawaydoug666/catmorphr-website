export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, predictionId } = req.body;

  try {
    // If predictionId provided, check status of existing prediction
    if (predictionId) {
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
      });
      
      const prediction = await statusResponse.json();
      return res.json(prediction);
    }

    // Otherwise create new prediction
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478",
        input: {
          init_image: imageData,
          prompt: prompt,
          negative_prompt: "low quality, blurry, anime, cartoon",
          num_inference_steps: 25,
          guidance_scale: 7.5,
          prompt_strength: 0.75
        }
      })
    });

    const prediction = await response.json();
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
