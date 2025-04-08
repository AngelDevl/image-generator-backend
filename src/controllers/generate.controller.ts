import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";
import { ImageUrlModel } from "../models/imageUrl.model.ts";

export const generateClient = tryCatch(async (req, res) => {
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
    console.log("existing image")
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
    console.log("existing image")
    const existingSecureUrl = existingImage.imageSecureUrl;

    await ImageUrlModel.updateOne(
      { prompt: prompt },
      { $inc: { usedCounter: 1 } }
    );
    
    res.set('Content-Type', 'text/html');
    res.send(`<img src="${existingSecureUrl}" alt="${prompt}"/>`);
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
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <!-- Standard OpenGraph tags for better compatibility -->
          <meta property="og:title" content="${encodeHTML(prompt)}" />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="${req.protocol}://${req.get(
      "host"
    )}${req.originalUrl}" />
          <meta property="og:image" content="${secureUrl}" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content="${encodeHTML(prompt)}" />
          <meta property="og:description" content="Generated image for '${encodeHTML(
            prompt
          )}'" />
          <meta property="og:site_name" content="AI Image Generator" />
          
          <!-- Twitter card tags -->
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content="${secureUrl}" />
          <meta name="twitter:title" content="${encodeHTML(prompt)}" />
          <meta name="twitter:description" content="Generated image for '${encodeHTML(
            prompt
          )}'" />
          
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${encodeHTML(prompt)}</title>
        </head>
        <body>
          <div class="image-container">
            <div class="spinner" id="spinner"></div>
            <img id="image" src="${secureUrl}" alt="${encodeHTML(
      prompt
    )}" style="opacity: 1;" />
          </div>
          <a href="/" class="home-button">Home</a>
          
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              const imgElement = document.getElementById('image');
              const spinner = document.getElementById('spinner');
              
              // Hide spinner once the image is loaded
              imgElement.onload = function() {
                spinner.style.display = 'none';
              };
              
              // Handle loading error
              imgElement.onerror = function() {
                spinner.style.display = 'none';
                imgElement.src = "${secureUrl}"; // Try loading again
              };
            });
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    throw new ApiError(
      ERROR_CODES.CLOUDINARY_UPLOAD_FAILED,
      "Failed to upload generated image",
      500,
      { originalError: error }
    );
  }
});

// Helper function to prevent XSS
function encodeHTML(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
