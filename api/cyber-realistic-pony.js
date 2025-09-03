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
      // Use Replicate's current ControlNet collection models
      console.log('Using modern ControlNet workflow with', controlNetType);
      
      let controlNetModel;
      let preprocessorType;
      
      switch (controlNetType) {
        case 'openpose':
          controlNetModel = "thibaud/controlnet-openpose-sdxl-1.0:fef7137c1c01b7ec7d7b8cd96e5b2a05b8e0b09c95c6b0e394d7a3c0ce8b3e80";
          preprocessorType = 'openpose';
          break;
        case 'canny':
          controlNetModel = "lucataco/controlnet-canny-sdxl-1.0:2c73fcbe21b3b9d80eacb6b09ae19e9cc2c14d0c5e32ddf65c44936bf10cb80a";
          preprocessorType = 'canny';
          break;
        case 'depth':
          controlNetModel = "lucataco/controlnet-depth-sdxl-1.0:2c73fcbe21b3b9d80eacb6b09ae19e9cc2c14d0c5e32ddf65c44936bf10cb80a";
          preprocessorType = 'depth';
          break;
        default:
          throw new Error(`Unknown ControlNet type: ${controlNetType}`);
      }

      // Step 1: Preprocess the image
      console.log('Step 1: Preprocessing with', preprocessorType);
      
      const preprocessorResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: "f6584ef76cf07a2014ffe1e9bdb1a5cfa714f031883ab43f8d4b05506625988e", // fofr/controlnet-preprocessors
          input: {
            image: imageData,
            preprocessor: preprocessorType === 'openpose' ? 'openpose_full' : preprocessorType
          }
        })
      });

      if (!preprocessorResponse.ok) {
        const errorText = await preprocessorResponse.text();
        throw new Error(`Preprocessor failed: ${preprocessorResponse.status} - ${errorText}`);
      }

      const preprocessorPrediction = await preprocessorResponse.json();
      console.log('Preprocessor prediction created:', preprocessorPrediction.id);

      // Poll for preprocessing completion
      let preprocessorResult = preprocessorPrediction;
      let pollCount = 0;
      const maxPolls = 30;

      while (preprocessorResult.status !== 'succeeded' && preprocessorResult.status !== 'failed' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${preprocessorResult.id}`, {
          headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        
        if (!pollResponse.ok) {
          throw new Error(`Preprocessing poll failed: ${pollResponse.status}`);
        }
        
        preprocessorResult = await pollResponse.json();
        pollCount++;
        console.log(`Preprocessing poll ${pollCount}: ${preprocessorResult.status}`);
      }

      if (preprocessorResult.status !== 'succeeded') {
        throw new Error(`Preprocessing failed: ${preprocessorResult.error || 'Unknown error'}`);
      }

      const controlImage = Array.isArray(preprocessorResult.output) ? 
                          preprocessorResult.output[0] : preprocessorResult.output;
      
      if (!controlImage) {
        throw new Error('No control image generated from preprocessor');
      }

      console.log('Step 2: ControlNet generation with control image');

      // Step 2: Use ControlNet with the control image
      const controlNetInput = {
        image: imageData,  // Original image
        control_image: controlImage,  // Preprocessed control map
        prompt: prompt,
        negative_prompt: negativePrompt || "score_6, score_5, score_4, (worst quality:1.2), (low quality:1.2), (normal quality:1.2), lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
        num_inference_steps: 20,
        guidance_scale: 4,
        strength: parseFloat(strength), // img2img denoising strength
        controlnet_conditioning_scale: parseFloat(controlNetStrength), // ControlNet influence
        controlnet_start: 0.0,
        controlnet_end: 1.0
      };

      console.log('Using modern ControlNet model:', controlNetModel);

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
        throw new Error(`ControlNet generation failed: ${controlNetResponse.status} - ${errorText}`);
      }

      const controlNetPrediction = await controlNetResponse.json();
      console.log('ControlNet generation created:', controlNetPrediction.id);
      
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
        strength: parseFloat(strength)
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
        throw new Error(`Regular generation failed: ${response.status} - ${errorText}`);
      }

      const prediction = await response.json();
      console.log('Regular img2img prediction created:', prediction.id);
      
      return res.json(prediction);
    }

  } catch (error) {
    console.error('API handler error:', error.message);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
