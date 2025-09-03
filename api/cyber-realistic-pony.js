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
      // STEP 1: Preprocess the image to create control map
      console.log('Step 1: Preprocessing image with', controlNetType);
      
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
            preprocessor: controlNetType === 'openpose' ? 'openpose' : 
                         controlNetType === 'canny' ? 'canny' : 'depth_midas'
          }
        })
      });

      if (!preprocessorResponse.ok) {
        const errorText = await preprocessorResponse.text();
        throw new Error(`Preprocessor API failed: ${preprocessorResponse.status} - ${errorText}`);
      }

      const preprocessorPrediction = await preprocessorResponse.json();
      console.log('Preprocessor prediction created:', preprocessorPrediction.id);

      // Poll for preprocessing completion
      let preprocessorResult = preprocessorPrediction;
      let pollCount = 0;
      const maxPolls = 30; // 150 seconds max for preprocessing

      while (preprocessorResult.status !== 'succeeded' && preprocessorResult.status !== 'failed' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${preprocessorResult.id}`, {
          headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        
        if (!pollResponse.ok) {
          throw new Error(`Failed to poll preprocessor: ${pollResponse.status}`);
        }
        
        preprocessorResult = await pollResponse.json();
        pollCount++;
        console.log(`Preprocessing poll ${pollCount}: ${preprocessorResult.status}`);
      }

      if (preprocessorResult.status === 'failed') {
        throw new Error(`Preprocessing failed: ${preprocessorResult.error || 'Unknown preprocessing error'}`);
      }

      if (preprocessorResult.status !== 'succeeded') {
        throw new Error(`Preprocessing timed out after ${maxPolls * 5} seconds`);
      }

      const controlImageUrl = Array.isArray(preprocessorResult.output) ? 
                              preprocessorResult.output[0] : preprocessorResult.output;
      
      if (!controlImageUrl) {
        throw new Error('No control image generated from preprocessor');
      }

      console.log('Step 2: Starting ControlNet generation');

      // STEP 2: Use ControlNet with control map
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
        image: imageData,
        control_image: controlImageUrl,
        prompt: prompt,
        negative_prompt: negativePrompt || "score_6, score_5, score_4, (worst quality:1.2), (low quality:1.2), (normal quality:1.2), lowres, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
        num_inference_steps: 20,
        guidance_scale: 4,
        strength: parseFloat(strength), // img2img denoising strength
        controlnet_conditioning_scale: parseFloat(controlNetStrength) // ControlNet influence
      };

      console.log('Using ControlNet model:', controlNetModel);

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
