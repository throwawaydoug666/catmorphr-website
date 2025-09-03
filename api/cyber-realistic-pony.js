export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    imageData, 
    prompt, 
    negativePrompt, 
    predictionId, 
    useControlNet = false, 
    controlNetType = 'openpose', 
    strength = 0.4, 
    controlNetStrength = 0.8 
  } = req.body;

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

    console.log('Starting transformation with ControlNet:', useControlNet);
    console.log('Parameters - img2img strength:', strength, 'controlnet strength:', controlNetStrength);

    if (useControlNet) {
      // Use jagilley ControlNet models directly (they do their own preprocessing)
      console.log('Using jagilley ControlNet model with', controlNetType);
      
      let controlNetModel;
      switch (controlNetType) {
        case 'openpose':
          controlNetModel = "jagilley/controlnet-pose:0304f7f774ba7341ef754231f794b1ba3d129e3c46af3022241325ae0c50fb99";
          break;
        case 'canny':
          controlNetModel = "jagilley/controlnet-canny:aff48af9c68d162388d230a2ab003f68d2638d88307bdaf1c2f1ac95079c9613";
          break;
        case 'depth':
          controlNetModel = "jagilley/controlnet-depth2img:922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60";
          break;
        default:
          throw new Error(`Unknown ControlNet type: ${controlNetType}`);
      }

      const controlNetInput = {
        image: imageData,  // Original image (jagilley models do their own preprocessing)
        prompt: prompt,
        negative_prompt: negativePrompt || "score_6, score_5, score_4, (worst quality:1.2), (low quality:1.2), (normal quality:1.2), lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
        num_inference_steps: 20,
        guidance_scale: 4,
        strength: parseFloat(strength), // img2img denoising strength
        scale: parseFloat(controlNetStrength) // ControlNet influence (jagilley uses 'scale' not 'controlnet_conditioning_scale')
      };

      console.log('Using ControlNet model:', controlNetModel);
      console.log('Input parameters:', {
        strength: controlNetInput.strength,
        scale: controlNetInput.scale,
        steps: controlNetInput.num_inference_steps
      });

      const controlNetResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          version: controlNetModel, 
          input: controlNetInput 
        })
      });

      if (!controlNetResponse.ok) {
        const errorText = await controlNetResponse.text();
        throw new Error(`ControlNet API failed: ${controlNetResponse.status} - ${errorText}`);
      }

      const controlNetPrediction = await controlNetResponse.json();
      console.log('ControlNet prediction created:', controlNetPrediction.id);
      
      return res.json(controlNetPrediction);

    } else {
      // Regular img2img without ControlNet
      console.log('Using regular img2img (ControlNet disabled)');
      
      const modelVersion = "76125795acdc8610c8b2d0352e691735054f0fbf31e1a1ae46fbc51b4dcc9ab5";
      
      const input = {
        image: imageData,
        prompt: prompt,
        negative_prompt: negativePrompt || "score_6, score_5, score_4, (worst quality:1.2), (low quality:1.2), (normal quality:1.2), lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
        num_inference_steps: 20,
        guidance_scale: 4,
        strength: parseFloat(strength) // img2img denoising strength only
      };

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
        throw new Error(`Replicate API failed: ${response.status} - ${errorText}`);
      }

      const prediction = await response.json();
      console.log('Regular img2img prediction created:', prediction.id);
      
      return res.json(prediction);
    }

  } catch (error) {
    console.error('API handler error:', error.message);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
}
