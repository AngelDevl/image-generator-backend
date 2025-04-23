import { Request, Response } from "express";
import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";
import { ImageUrlModel } from "../models/imageUrl.model.ts";
import { BuildHtmlResponse, encodeHTML } from "../utils/BuildHtmlResponse.ts";
import { imageIsBeingGenerated, imageIsBeingGeneratedPreview } from "../fixed/response.fixed.ts";

// Map to track ongoing image generations to prevent duplicates
const generating = new Map<string, { inProcess: boolean; startTime: number }>();

// Cleanup old entries in the generating map (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [prompt, data] of generating.entries()) {
    // Remove entries older than 10 minutes
    if (now - data.startTime > 10 * 60 * 1000) {
      generating.delete(prompt);
    }
  }
}, 5 * 60 * 1000);

const currentGenerationMethod = generateImage;

// Simple HTML for WhatsApp bots
function buildWhatsAppBotResponse(prompt: string, imageUrl: string, isGenerating: boolean = false) {
  const title = isGenerating ? `Generating: ${encodeHTML(prompt)}` : encodeHTML(prompt);
  const description = isGenerating 
    ? `Generating image for: ${encodeHTML(prompt)}` 
    : `AI generated image: ${encodeHTML(prompt)}`;
  
  return `<!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="${title}" />
        <meta property="og:image" content="${imageUrl}" />
        <meta property="og:description" content="${description}" />
        <title>${title}</title>
      </head>
      <body>
        <img src="${imageUrl}" alt="${encodeHTML(prompt)}"/>
        <p>${description}</p>
      </body>
    </html>`;
  }

// Helper function to generate and store image in the background
async function generateAndStoreImage(prompt: string) {
  try {
    // Mark as in process
    generating.set(prompt, { inProcess: true, startTime: Date.now() });
    
    const aiResponse = await currentGenerationMethod(prompt);
    
    if (!aiResponse?.success || !aiResponse.imageBuffer) {
      console.error("Background image generation failed:", 
        aiResponse?.message || "Unknown error");
      
      // Mark as completed (even with failure)
      generating.delete(prompt);
      return null;
    }
    
    const cloudinaryResponse = await cloudinary.uploader.upload(
      `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;
    const imageSizeKB = cloudinaryResponse.bytes / 1024;

    await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1,
      size: imageSizeKB,
      width: cloudinaryResponse.width,
      height: cloudinaryResponse.height
    });
    
    console.log("Background image generation completed for:", prompt);
    
    // Mark as completed
    generating.delete(prompt);
    
    return secureUrl;
  } catch (error) {
    console.error("Background image generation/storage failed:", error);
    
    // Mark as completed (even with failure)
    generating.delete(prompt);
    
    return null;
  }
}

// Function to detect if the request is from WhatsApp or similar preview bots
function isPreviewBot(req: Request): boolean {
  const userAgent = req.get('user-agent') || '';
  return userAgent.includes('WhatsApp') || 
         userAgent.includes('facebookexternalhit') || 
         userAgent.includes('Facebot') ||
         userAgent.includes('Twitterbot') ||
         userAgent.includes('LinkedInBot') ||
         userAgent.includes('Slackbot');
}

// Main client generation endpoint
export const generateClient = tryCatch(async (req: Request, res: Response) => {
  let prompt = req.params.prompt;

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }

  if (!prompt.endsWith("$")) {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }

  prompt = prompt.substring(0, prompt.length - 1);
  const previewBot = isPreviewBot(req);

  // Check for existing image in database first
  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    let existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );
    
    res.set('Content-Type', 'text/html');
    
    // Simplified response for WhatsApp and other preview bots
    if (previewBot) {
      res.send(buildWhatsAppBotResponse(prompt, existingSecureUrl));
    } else {
      // Full interactive response for regular users
      res.send(BuildHtmlResponse(req, existingSecureUrl, prompt));
    }
    return;
  }

  // Check if this image is already being generated
  const generationData = generating.get(prompt);
  if (generationData && generationData.inProcess) {
    console.log(`Generation already in progress for: ${prompt}`);
    
    // For preview bots, send the placeholder immediately
    if (previewBot) {
      const placeholderUrl = `${req.protocol}://${req.get('host')}/app/animations/placeholder.gif`;
      
      res.set('Content-Type', 'text/html');
      res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
      return;
    }
    
    // For regular users, show a "generating" page with auto-refresh
    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
      <html>
        <head>
          <title>Generating image for: ${encodeHTML(prompt)}</title>
          <meta http-equiv="refresh" content="3">
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
            }
            .loading-container {
              text-align: center;
            }
            .loading-spinner {
              border: 5px solid #f3f3f3;
              border-top: 5px solid #3498db;
              border-radius: 50%;
              width: 50px;
              height: 50px;
              animation: spin 1s linear infinite;
              margin: 20px auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <h2>Your image is being generated</h2>
            <p>This page will automatically refresh when ready (${encodeHTML(prompt)})</p>
          </div>
        </body>
      </html>`);
    return;
  }

  console.log("Client generation for:", prompt);

  // If it's a preview bot, return a placeholder and generate in background
  if (previewBot) {
    const placeholderUrl = `${req.protocol}://${req.get('host')}/app/animations/placeholder.gif`;
    
    res.set('Content-Type', 'text/html');
    res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
    
    // Continue processing the image in the background without awaiting
    generating.set(prompt, { inProcess: true, startTime: Date.now() });
    generateAndStoreImage(prompt).catch(err => {
      console.error("Background image generation failed:", err);
      generating.delete(prompt);
    });
    return;
  }

  // For regular users, we'll generate the image synchronously
  // Mark as in process before starting
  generating.set(prompt, { inProcess: true, startTime: Date.now() });
  
  try {
    // For regular users, generate the image synchronously
    const aiResponse = await currentGenerationMethod(prompt);

    if (!aiResponse?.success || !aiResponse.imageBuffer) {
      // Clean up generating map on failure
      generating.delete(prompt);
      
      throw new ApiError(
        ERROR_CODES.IMAGE_GENERATION_FAILED,
        aiResponse?.message || "Image generation failed",
        400
      );
    }

    const cloudinaryResponse = await cloudinary.uploader.upload(
      `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;
    const imageSizeKB = cloudinaryResponse.bytes / 1024;
    
    await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1,
      size: imageSizeKB,
      width: cloudinaryResponse.width,
      height: cloudinaryResponse.height
    });

    // Clean up generating map
    generating.delete(prompt);

    res.set('Content-Type', 'text/html');
    res.send(BuildHtmlResponse(req, secureUrl, prompt));
  } catch (error) {
    // Clean up generating map on error
    generating.delete(prompt);
    
    throw new ApiError(
      ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
      "Failed to upload generated image",
      500,
      { originalError: error }
    );
  }
});

function getTransformedUrl(existingSecureUrl: string, options = {}) {
  // Extract the public ID from the existing URL
  // Example URL: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/image.jpg
  const urlParts = existingSecureUrl.split('/');
  const uploadIndex = urlParts.indexOf('upload');
  
  if (uploadIndex === -1) {
    throw new Error('Invalid Cloudinary URL format');
  }
  
  // Get everything after "upload" and any version number (v1234567890)
  let publicIdParts = urlParts.slice(uploadIndex + 1);
  
  // If the first part starts with 'v', it's a version number, so remove it
  if (publicIdParts[0] && publicIdParts[0].startsWith('v')) {
    publicIdParts = publicIdParts.slice(1);
  }
  
  // Join the remaining parts to get the public ID
  const publicId = publicIdParts.join('/');
  
  // Generate the transformed URL
  return cloudinary.url(publicId, {
    ...options,
    secure: true
  });
}


export const gen = tryCatch(async (req: Request, res: Response) => {
  let prompt = req.params.prompt;

  // Prompt validation
  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }

  if (!prompt.endsWith("$")) {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }

  prompt = prompt.substring(0, prompt.length - 1);
  const userAgent = req.get('user-agent') || '';
  const isPreview = isPreviewBot(req)

  // Part 1: Check if image already exists in cloudinary | MongoDB 
  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    const existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );

    // Set content type
    res.set("Content-Type", "text/html");
    if (isPreview) {
      if (userAgent.includes('WhatsApp')) {
        const transformedUrl = getTransformedUrl(existingSecureUrl, {
          height: existingImage.height,
          width: existingImage.width,
          crop: 'fill'
        });
  
        res.send(BuildHtmlResponse(req, transformedUrl, prompt));
        return;
      }
  
      // Handle other previews in the future
      res.send(BuildHtmlResponse(req, existingSecureUrl, prompt));
      return;
    }

    // For regular users (trying to access the image via the server)
    res.send(BuildHtmlResponse(req, existingSecureUrl, prompt));
    return;
  }

  // Check if image is already being generated
  const generationData = generating.get(prompt);
  if (generationData && generationData.inProcess) {

    // Send image is already being generated please try again in a few seconds
    if (isPreview) {
      res.send(imageIsBeingGeneratedPreview(prompt))
      return;
    }

    res.send(imageIsBeingGenerated(prompt))
    return;
  }

  // Part 2: Generate the image

  // For a preview
  if (isPreview) {
    const placeholderUrl = `${req.protocol}://${req.get('host')}/app/animations/placeholder.gif`;
    
    res.set('Content-Type', 'text/html');
    res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
    
    // Continue processing the image in the background
    generating.set(prompt, { inProcess: true, startTime: Date.now() });
    generateAndStoreImage(prompt).catch(err => {
      console.error("Background image generation failed:", err);
      generating.delete(prompt);
    });
    return;
  }

  // For a regular:

  // Check if any models are available
  const modelStatus = getModelStatus();
  const anyModelAvailable = Object.values(modelStatus).some(
    (status) => status.available
  );

  // Send an error if not models are not available
  if (!anyModelAvailable) {
    throw new ApiError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      "All image generation models are currently unavailable. Please try again later.",
      503,
      { modelStatus }
    );
  }

  // Mark and store prompt
  generating.set(prompt, { inProcess: true, startTime: Date.now() });


  try {
        // For regular users, generate the image synchronously
        const aiResponse = await currentGenerationMethod(prompt);

        if (!aiResponse?.success || !aiResponse.imageBuffer) {
          // Clean up generating map on failure
          generating.delete(prompt);
          
          throw new ApiError(
            ERROR_CODES.IMAGE_GENERATION_FAILED,
            aiResponse?.message || "Image generation failed",
            400
          );
        }
    
        const cloudinaryResponse = await cloudinary.uploader.upload(
          `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
          { resource_type: "auto" }
        );
    
        const secureUrl = cloudinaryResponse.secure_url;
        const imageSizeKB = cloudinaryResponse.bytes / 1024;
        
        await ImageUrlModel.create({
          prompt: prompt,
          imageSecureUrl: secureUrl,
          usedCounter: 1,
          size: imageSizeKB,
          width: cloudinaryResponse.width,
          height: cloudinaryResponse.height
        });
    
        // Clean up generating map
        generating.delete(prompt);
    
        res.set('Content-Type', 'text/html');
        res.send(BuildHtmlResponse(req, secureUrl, prompt));    
  } catch (error) {
      // Clean up generating map on error
      generating.delete(prompt);
  
      throw new ApiError(
        ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
        "Failed to upload generated image",
        500,
        { originalError: error }
      );    
  }
});










// Server generation endpoint
// export const generateServer = tryCatch(async (req: Request, res: Response) => {
//   console.log(req.get('user-agent'))
//   let prompt = req.params.prompt;

//   if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
//     throw new ApiError(
//       ERROR_CODES.INVALID_INPUT,
//       "Invalid or missing prompt parameter",
//       400
//     );
//   }

//   if (!prompt.endsWith("$")) {
//     throw new ApiError(
//       ERROR_CODES.INVALID_INPUT,
//       "Invalid or missing prompt parameter",
//       400
//     );
//   }

//   prompt = prompt.substring(0, prompt.length - 1);
//   const previewBot = isPreviewBot(req);

//   // Check for existing image
//   const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
//   if (existingImage) {
//     let existingSecureUrl = existingImage.imageSecureUrl;
//     const transformedUrl = getTransformedUrl(existingSecureUrl, {
//       height: 681,
//       width: 1024,
//       crop: 'fill'
//     })

//     console.log(existingSecureUrl)

//     console.log(transformedUrl)
//     await ImageUrlModel.updateOne(
//       { prompt: prompt },
//       { $inc: { usedCounter: 1 } }
//     );
    
//     res.set("Content-Type", "text/html");
    
//     if (previewBot) {
//       res.send(buildWhatsAppBotResponse(prompt, transformedUrl));
//     } else {
//       console.log("special")
//       res.send(BuildHtmlResponse(req, transformedUrl, prompt));
//     }
//     return;
//   }

//   // Check if this image is already being generated
//   const generationData = generating.get(prompt);
//   if (generationData && generationData.inProcess) {
//     console.log(`Generation already in progress for: ${prompt}`);
    
//     // For preview bots, send the placeholder immediately
//     if (previewBot) {
//       const placeholderUrl = `${req.protocol}://${req.get('host')}/app/animations/placeholder.gif`;
      
//       res.set('Content-Type', 'text/html');
//       res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
//       return;
//     }
    
//     // For regular users, show a "generating" page with auto-refresh
//     console.log("regular")
//     res.set('Content-Type', 'text/html');
//     res.send(`<!DOCTYPE html>
//       <html>
//         <head>
//           <title>Generating image for: ${encodeHTML(prompt)}</title>
//           <meta http-equiv="refresh" content="3">
//           <style>
//             body {
//               font-family: Arial, sans-serif;
//               display: flex;
//               flex-direction: column;
//               align-items: center;
//               justify-content: center;
//               height: 100vh;
//               margin: 0;
//               background-color: #f5f5f5;
//             }
//             .loading-container {
//               text-align: center;
//             }
//             .loading-spinner {
//               border: 5px solid #f3f3f3;
//               border-top: 5px solid #3498db;
//               border-radius: 50%;
//               width: 50px;
//               height: 50px;
//               animation: spin 1s linear infinite;
//               margin: 20px auto;
//             }
//             @keyframes spin {
//               0% { transform: rotate(0deg); }
//               100% { transform: rotate(360deg); }
//             }
//           </style>
//         </head>
//         <body>
//           <div class="loading-container">
//             <div class="loading-spinner"></div>
//             <h2>Your image is being generated</h2>
//             <p>This page will automatically refresh when ready (${encodeHTML(prompt)})</p>
//           </div>
//         </body>
//       </html>`);
//     return;
//   }

//   console.log("Server generation for:", prompt);




//   // If it's a preview bot, return a placeholder and generate in background
//   if (previewBot) {
//     const placeholderUrl = `${req.protocol}://${req.get('host')}/app/animations/placeholder.gif`;
    
//     res.set('Content-Type', 'text/html');
//     res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
    
//     // Continue processing the image in the background
//     generating.set(prompt, { inProcess: true, startTime: Date.now() });
//     generateAndStoreImage(prompt).catch(err => {
//       console.error("Background image generation failed:", err);
//       generating.delete(prompt);
//     });
//     return;
//   }




//   // Check model availability before attempting generation
//   const modelStatus = getModelStatus();
//   const anyModelAvailable = Object.values(modelStatus).some(
//     (status) => status.available
//   );

//   if (!anyModelAvailable) {
//     throw new ApiError(
//       ERROR_CODES.SERVICE_UNAVAILABLE,
//       "All image generation models are currently unavailable. Please try again later.",
//       503,
//       { modelStatus }
//     );
//   }

//   // Mark as in process before starting
//   generating.set(prompt, { inProcess: true, startTime: Date.now() });
  
//   try {
//     // For regular users, generate the image
//     const aiResponse = await currentGenerationMethod(prompt);

//     if (!aiResponse?.success || !aiResponse.imageBuffer) {
//       // Clean up generating map on failure
//       generating.delete(prompt);
      
//       throw new ApiError(
//         ERROR_CODES.IMAGE_GENERATION_FAILED,
//         aiResponse?.message || "Image generation failed",
//         400
//       );
//     }

//     // Save the image to Cloudinary
//     const cloudinaryResponse = await cloudinary.uploader.upload(
//       `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
//       {
//         resource_type: "auto",
//         // quality: "100", // Enables automatic quality compression
//         // fetch_format: "auto", // Automatically select the best format
//         // Optional - if you want to set a specific quality instead of auto
//         // quality: 80, // Range from 1 (worst) to 100 (best)
//         // Optional - explicitly convert to a specific format
//         // format: "webp", // or jpeg, png, etc.
//       }
//     );

//     const secureUrl = cloudinaryResponse.secure_url;
//     const imageSizeKB = cloudinaryResponse.bytes / 1024;

//     await ImageUrlModel.create({
//       prompt: prompt,
//       imageSecureUrl: secureUrl,
//       usedCounter: 1,
//       size: imageSizeKB,
//       width: cloudinaryResponse.width,
//       height: cloudinaryResponse.height
//     });

//     // Clean up generating map
//     generating.delete(prompt);

//     // Send HTML response with proper meta tags
//     console.log("lolo")

//     res.set("Content-Type", "text/html");
//     res.send(BuildHtmlResponse(req, secureUrl, prompt));
//   } catch (error) {
//     // Clean up generating map on error
//     generating.delete(prompt);
    
//     throw new ApiError(
//       ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
//       "Failed to upload generated image",
//       500,
//       { originalError: error }
//     );
//   }
// });
