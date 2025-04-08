import { Request, Response } from "express";
import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";
import { ImageUrlModel } from "../models/imageUrl.model.ts";
import { generateImageFromPrompt } from "../services/runware.service.ts";
import { generateImageFromPromptDalle } from "../services/openai.service.ts";
import { BuildHtmlResponse, encodeHTML } from "../utils/BuildHtmlResponse.ts";


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
    const aiResponse = await currentGenerationMethod(prompt);
    
    if (!aiResponse?.success || !aiResponse.imageBuffer) {
      console.error("Background image generation failed:", 
        aiResponse?.message || "Unknown error");
      return;
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
    return secureUrl;
  } catch (error) {
    console.error("Background image generation/storage failed:", error);
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

  // Check for existing image
  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    const existingSecureUrl = existingImage.imageSecureUrl;

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

  console.log("Client generation for:", prompt);

  // If it's a preview bot and image doesn't exist yet, return a placeholder
  // This allows the preview to load immediately while generation happens in background
  if (previewBot) {
    // Use a placeholder image URL that loads quickly
    const placeholderUrl = "https://via.placeholder.com/1200x630?text=Generating+Image...";
    
    res.set('Content-Type', 'text/html');
    res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
    
    // Continue processing the image in the background
    generateAndStoreImage(prompt).catch(err => 
      console.error("Background image generation failed:", err));
    return;
  }

  // For regular users, generate the image synchronously
  const aiResponse = await currentGenerationMethod(prompt);

  if (!aiResponse?.success || !aiResponse.imageBuffer) {
    throw new ApiError(
      ERROR_CODES.IMAGE_GENERATION_FAILED,
      aiResponse?.message || "Image generation failed",
      400
    );
  }

  try {
    const cloudinaryResponse = await cloudinary.uploader.upload(
      `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;

    const newImageDoc = await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1
    });

    res.set('Content-Type', 'text/html');
    res.send(BuildHtmlResponse(req, secureUrl, prompt));
  } catch (error) {
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
    const existingSecureUrl = existingImage.imageSecureUrl;

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

  console.log("Server generation for:", prompt);

  // If it's a preview bot and image doesn't exist yet, return a placeholder
  if (previewBot) {
    const placeholderUrl = "https://via.placeholder.com/1200x630?text=Generating+Image...";
    
    res.set('Content-Type', 'text/html');
    res.send(buildWhatsAppBotResponse(prompt, placeholderUrl, true));
    
    // Generate in background
    generateAndStoreImage(prompt).catch(err => 
      console.error("Background image generation failed:", err));
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

  // For regular users, generate the image
  const aiResponse = await currentGenerationMethod(prompt);

  if (!aiResponse?.success || !aiResponse.imageBuffer) {
    throw new ApiError(
      ERROR_CODES.IMAGE_GENERATION_FAILED,
      aiResponse?.message || "Image generation failed",
      400
    );
  }

  try {
    // Save the image to Cloudinary
    const cloudinaryResponse = await cloudinary.uploader.upload(
      `data:image/png;base64,${aiResponse.imageBuffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;

    const newImageDoc = await ImageUrlModel.create({
      prompt: prompt,
      imageSecureUrl: secureUrl,
      usedCounter: 1
    });

    // Send HTML response with proper meta tags
    res.set("Content-Type", "text/html");
    res.send(BuildHtmlResponse(req, secureUrl, prompt));
  } catch (error) {
    throw new ApiError(
      ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
      "Failed to upload generated image",
      500,
      { originalError: error }
    );
  }
});

// Optional - Additional endpoint to check status of background generations
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
  
  if (existingImage) {
    res.json({
      status: "completed",
      imageUrl: existingImage.imageSecureUrl
    });
  } else {
    res.json({
      status: "pending"
    });
  }
});