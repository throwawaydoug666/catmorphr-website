export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, prompt, negativePrompt, predictionId, strength = 0.4 } = req.body;

  try {
    // Check if we're polling for a result
    if (predictionId) {
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to get prediction status: ${statusResponse.status}`);
      }
      
      return res.json(await statusResponse.json());
    }

    // Validate required fields
    if (!imageData || !prompt) {
      return res.status(400).json({ error: 'Missing required fields: imageData and prompt' });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'REPLICATE_API_TOKEN environment variable not set' });
    }

    console.log('Starting CyberRealistic Pony transformation...');
    
    // Use the correct CyberRealistic Pony model version
    const modelVersion = "76125795acdc8610c8b2d0352e691735054f0fbf31e1a1ae46fbc51b4dcc9ab5";
    
    const input = {
      image: imageData,
      prompt: prompt,
      negative_prompt: negativePrompt || "score_6, score_5, score_4, (worst quality:1.2), (low quality:1.2), (normal quality:1.2), lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
      num_inference_steps: 20,
      guidance_scale: 4,
      strength: parseFloat(strength)
    };

    console.log('Calling Replicate API with model version:', modelVersion);

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        version: modelVersion, 
        input: input 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Replicate API error:', response.status, errorText);
      throw new Error(`Replicate API error: ${response.status} - ${errorText}`);
    }

    const prediction = await response.json();
    console.log('Prediction created:', prediction.id);
    
    return res.json(prediction);

  } catch (error) {
    console.error('API handler error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
}
