import { Request, Response } from "express";
import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";
import { ImageUrlModel } from "../models/imageUrl.model.ts";
import { BuildHtmlResponse, encodeHTML } from "../utils/BuildHtmlResponse.ts";

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

    await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1
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

    await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1
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
export const generateServer = tryCatch(async (req: Request, res: Response) => {
  console.log(req.get('user-agent'))
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

  // Check for existing image
  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    let existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );
    
    res.set("Content-Type", "text/html");
    
    if (previewBot) {
      res.send(buildWhatsAppBotResponse(prompt, existingSecureUrl));
    } else {
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

  console.log("Server generation for:", prompt);

  // If it's a preview bot, return a placeholder and generate in background
  if (previewBot) {
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

  // Check model availability before attempting generation
  const modelStatus = getModelStatus();
  const anyModelAvailable = Object.values(modelStatus).some(
    (status) => status.available
  );

  if (!anyModelAvailable) {
    throw new ApiError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      "All image generation models are currently unavailable. Please try again later.",
      503,
      { modelStatus }
    );
  }

  // Mark as in process before starting
  generating.set(prompt, { inProcess: true, startTime: Date.now() });
  
  try {
    // For regular users, generate the image
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

    // Save the image to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(
      `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;

    await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1
    });

    // Clean up generating map
    generating.delete(prompt);

    // Send HTML response with proper meta tags
    res.set("Content-Type", "text/html");
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

// Status checking endpoint
export const checkGenerationStatus = tryCatch(async (req: Request, res: Response) => {
  const prompt = req.params.prompt;
  
  if (!prompt) {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Missing prompt parameter",
      400
    );
  }
  
  const cleanPrompt = prompt.endsWith("$") 
    ? prompt.substring(0, prompt.length - 1) 
    : prompt;
    
  const existingImage = await ImageUrlModel.findOne({ prompt: cleanPrompt });
  
  // Check if image exists in database
  if (existingImage) {
    res.json({
      status: "completed",
      imageUrl: existingImage.imageSecureUrl
    });
    return;
  }
  
  // Check if image is being generated
  const generationData = generating.get(cleanPrompt);
  if (generationData && generationData.inProcess) {
    const elapsedSeconds = Math.floor((Date.now() - generationData.startTime) / 1000);
    res.json({
      status: "generating",
      elapsedSeconds
    });
    return;
  }
  
  // If not in database and not being generated
  res.json({
    status: "not_found"
  });
});