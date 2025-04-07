import { generateImage, getModelStatus } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";

export const generateClient = tryCatch(async (req, res) => {
  const prompt = req.params.prompt;
  
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
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
  
  res.set("Content-Type", "image/png");
  res.send(aiResponse.imageBuffer);
});

export const generateServer = tryCatch(async (req, res) => {
  const prompt = req.params.prompt;
  
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new ApiError(
      ERROR_CODES.INVALID_INPUT,
      "Invalid or missing prompt parameter",
      400
    );
  }
  
  console.log("Server generation for:", prompt);

  // Check model availability before attempting generation
  const modelStatus = getModelStatus();
  const anyModelAvailable = Object.values(modelStatus).some(status => status.available);
  
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
      `data:image/png;base64,${aiResponse.imageBuffer.toString('base64')}`, 
      { resource_type: "auto" }
    );

    const secureUrl = cloudinaryResponse.secure_url;
    
    // Send HTML response with proper meta tags and spinner
    res.set("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="og:title" content="${encodeHTML(prompt)}" />
          <meta property="og:image" content="${secureUrl}" />
          <meta property="og:description" content="Generated image for '${encodeHTML(prompt)}'" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${encodeHTML(prompt)}</title>
          <style>
            body {
              background: #121212;
              color: white;
              text-align: center;
              font-family: Arial, sans-serif;
              padding: 20px;
              margin: 0;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            h2 {
              margin-bottom: 20px;
              max-width: 800px;
              word-wrap: break-word;
            }
            .image-container {
              position: relative;
              width: 90%;
              max-width: 800px;
              margin: 0 auto 30px;
            }
            img {
              max-width: 100%;
              border-radius: 1rem;
              box-shadow: 0 4px 8px rgba(0,0,0,0.3);
              transition: opacity 0.5s ease;
            }
            .spinner {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 80px;
              height: 80px;
              border-radius: 50%;
              border: 6px solid #333;
              border-top-color: #fff;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              to { transform: translate(-50%, -50%) rotate(360deg); }
            }
            .hidden {
              opacity: 0;
            }
            .home-button {
              color: white;
              border: 1px solid white;
              padding: 10px 20px;
              border-radius: 8px;
              text-decoration: none;
              transition: all 0.3s ease;
              background: rgba(255,255,255,0.1);
            }
            .home-button:hover {
              background: rgba(255,255,255,0.2);
            }
          </style>
        </head>
        <body>
          <h2>"${encodeHTML(prompt)}"</h2>
          <div class="image-container">
            <div class="spinner" id="spinner"></div>
            <img id="image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="hidden" alt="${encodeHTML(prompt)}" />
          </div>
          <a href="/" class="home-button">Home</a>
          
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              const imgElement = document.getElementById('image');
              const spinner = document.getElementById('spinner');
              
              imgElement.onload = function() {
                // Hide spinner and show image when loaded
                spinner.style.display = 'none';
                imgElement.classList.remove('hidden');
              };
              
              // Set the actual image URL
              imgElement.src = "${secureUrl}";
              
              // Fallback if image fails to load after 10 seconds
              setTimeout(function() {
                if (imgElement.classList.contains('hidden')) {
                  spinner.style.display = 'none';
                  imgElement.classList.remove('hidden');
                  imgElement.src = "${secureUrl}";
                }
              }, 10000);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}