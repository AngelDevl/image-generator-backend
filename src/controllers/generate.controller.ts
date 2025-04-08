import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";
import { ImageUrlModel } from "../models/imageUrl.model.ts";
import BuildHtmlResponse from "../utils/BuildHtmlResponse.ts";

export const generateClient = tryCatch(async (req, res) => {
  const prompt = req.params.prompt;

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

  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    const existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );
    
    res.set('Content-Type', 'text/html');
    res.send(`<img src="${existingSecureUrl}" alt="${prompt}"/>`);
    return;
  }

  console.log("Client generation for:", prompt);

  const aiResponse = await generateImage(prompt);

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
    res.send(`<img src="${secureUrl}" alt="${prompt}"/>`);
  } catch (error) {
    throw new ApiError(
      ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
      "Failed to upload generated image",
      500,
      { originalError: error }
    );
  }
});

export const generateServer = tryCatch(async (req, res) => {
  const prompt = req.params.prompt;

  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }

  const existingImage = await ImageUrlModel.findOne({ prompt: prompt });
  if (existingImage) {
    const existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );
    
    res.set("Content-Type", "text/html");
    res.send(BuildHtmlResponse(req, existingSecureUrl, prompt));
    return;
  }

  console.log("Server generation for:", prompt);

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

  const aiResponse = await generateImage(prompt);

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

    // Send HTML response with proper meta tags for better preview compatibility
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