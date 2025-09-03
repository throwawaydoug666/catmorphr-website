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

    if (useControlNet) {
      console.log('Debug - Starting ControlNet preprocessing for:', controlNetType);
      
      // Step 1: Preprocess the image to create control map
      const preprocessorResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: "fofr/controlnet-preprocessors",
          input: {
            image: imageData,
            preprocessor: controlNetType === 'openpose' ? 'openpose' : 
                         controlNetType === 'canny' ? 'canny' : 'depth_midas'
          }
        })
      });

      if (!preprocessorResponse.ok) {
        console.log('Debug - Preprocessor failed, falling back to regular SD');
        // Fall back to regular stable diffusion if preprocessing fails
        return handleRegularStableDiffusion(imageData, prompt, strength);
      }

      const preprocessorPrediction = await preprocessorResponse.json();
      console.log('Debug - Preprocessor prediction created:', preprocessorPrediction.id);

      // Poll for preprocessing completion
      let preprocessorResult = preprocessorPrediction;
      let pollCount = 0;
      const maxPolls = 20; // 100 seconds max for preprocessing

      while (preprocessorResult.status !== 'succeeded' && preprocessorResult.status !== 'failed' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${preprocessorResult.id}`, {
          headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        
        preprocessorResult = await pollResponse.json();
        pollCount++;
      }

      if (preprocessorResult.status !== 'succeeded') {
        console.log('Debug - Preprocessing failed, falling back to regular SD');
        return handleRegularStableDiffusion(imageData, prompt, strength);
      }

      const controlImageUrl = Array.isArray(preprocessorResult.output) ? 
                              preprocessorResult.output[0] : preprocessorResult.output;
      
      console.log('Debug - Control image generated:', controlImageUrl ? 'success' : 'failed');

      // Step 2: Use ControlNet with both original image and control map
      let modelVersion;
      switch (controlNetType) {
        case 'openpose':
          modelVersion = "jagilley/controlnet-pose:0304f7f774ba7341ef754231f794b1ba3d129e3c46af3022241325ae0c50fb99";
          break;
        case 'canny':
          modelVersion = "jagilley/controlnet-canny:aff48af9c68d162388d230a2ab003f68d2638d88307bdaf1c2f1ac95079c9613";
          break;
        case 'depth':
          modelVersion = "jagilley/controlnet-depth2img:922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60";
          break;
        default:
          modelVersion = "jagilley/controlnet-pose:0304f7f774ba7341ef754231f794b1ba3d129e3c46af3022241325ae0c50fb99";
      }

      const controlNetInput = {
        image: imageData,
        control_image: controlImageUrl,
        prompt: prompt,
        negative_prompt: "(blurry:1.4), (out of focus:1.3), (soft focus:1.3), (low resolution:1.2), (pixelated:1.2), (low quality:1.3), (worst quality:1.4), (bad quality:1.2), (jpeg artifacts:1.2), (compression artifacts:1.2), (grainy:1.1), (noise:1.1), score_6, score_5, score_4, bad anatomy, bad hands, signature, watermarks, ugly, imperfect eyes, skewed eyes, unnatural face, unnatural body, error, extra limb, missing limbs",
        num_inference_steps: 30,
        guidance_scale: 4,
        strength: parseFloat(strength)
      };

      console.log('Debug - Starting ControlNet generation with model:', modelVersion);

      const controlNetResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ version: modelVersion, input: controlNetInput })
      });

      if (!controlNetResponse.ok) {
        console.log('Debug - ControlNet failed, falling back to regular SD');
        return handleRegularStableDiffusion(imageData, prompt, strength);
      }

      return res.json(await controlNetResponse.json());

    } else {
      // Regular Stable Diffusion (ControlNet disabled)
      return handleRegularStableDiffusion(imageData, prompt, strength);
    }

  } catch (error) {
    console.log('Debug - Exception:', error.message);
    res.status(500).json({ error: error.message });
  }

  // Helper function for regular Stable Diffusion
  async function handleRegularStableDiffusion(imageData, prompt, strength) {
    const modelVersion = "stability-ai/stable-diffusion";
    
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

    return res.json(await response.json());
  }
}
