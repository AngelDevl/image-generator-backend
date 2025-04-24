import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";

// Define model options with priorities
const IMAGE_GENERATION_MODELS = [
  "gemini-2.0-flash-exp"
];

// Track model availability and cooldown times
const modelStatus = new Map<
  string,
  {
    available: boolean;
    cooldownUntil: number;
  }
>();

// Initialize all models as available
IMAGE_GENERATION_MODELS.forEach((model) => {
  modelStatus.set(model, { available: true, cooldownUntil: 0 });
});

export interface AiResponse {
  success: boolean;
  imageBuffer: Buffer | null;
  message: string | null;
}

export const generateImage = async (prompt: string): Promise<AiResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = `Hi, can you create an image of a ${prompt} please refer to the content "${prompt}" as the image content`;

  // Try models in order until one works
  for (const model of IMAGE_GENERATION_MODELS) {
    // Skip models that are on cooldown
    const status = modelStatus.get(model);
    if (!status?.available || Date.now() < status?.cooldownUntil) {
      console.log(`Model ${model} unavailable, trying next model...`);
      continue;
    }

    try {
      console.log(`Attempting image generation with model: ${model}`);

      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          responseModalities: ["Text", "Image"],
        },
      });

      const firstCandidate = response.candidates?.[0];
      const parts = firstCandidate?.content?.parts;

      if (parts) {
        for (const part of parts) {
          if (part.text) {
            console.log(`Text response from model ${model}: ${part.text}`);

            // Check for overload indicators in the text response
            if (
              part.text.toLowerCase().includes("overloaded") ||
              part.text.toLowerCase().includes("try again later") ||
              part.text.toLowerCase().includes("capacity")
            ) {
              // Mark this model as unavailable for some time
              modelStatus.set(model, {
                available: false,
                cooldownUntil: Date.now() + 5 * 60 * 1000, // 5 minute cooldown
              });

              // Try the next model instead of returning
              console.log(
                `Model ${model} appears overloaded, applying cooldown`
              );
              break;
            }

            return { success: false, imageBuffer: null, message: part.text };
          } else if ((part as any).inlineData) {
            // Success! Reset this model's status to fully available
            modelStatus.set(model, { available: true, cooldownUntil: 0 });

            const imageData = (part as any).inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            console.log(`Successfully generated image with model: ${model}`);
            return { success: true, imageBuffer: buffer, message: null };
          }
        }

        // If we got here within the parts loop but didn't return,
        // this model attempt failed - continue to next model
        continue;
      }

      // No valid response - mark model for short cooldown
      modelStatus.set(model, {
        available: false,
        cooldownUntil: Date.now() + 30 * 1000, // 30 second cooldown
      });
    } catch (error) {
      console.log(`Error with model ${model}:`, error);

      if (error instanceof Error) {
        // Check if error indicates overload
        const errorMessage = error.toString().toLowerCase();
        const cooldownDuration =
          errorMessage.includes("overloaded") ||
          errorMessage.includes("rate limit")
            ? 5 * 60 * 1000 // 5 minutes for overload
            : 30 * 1000; // 30 seconds for other errors

        // Mark this model as unavailable temporarily
        modelStatus.set(model, {
          available: false,
          cooldownUntil: Date.now() + cooldownDuration,
        });
      }
    }
  }

  // All models failed - properly use ApiError with your error handling system
  throw new ApiError(
    ERROR_CODES.IMAGE_GENERATION_FAILED,
    "All image generation models are currently unavailable, please try again later",
    503, // Service Unavailable
    { modelStatus: getModelStatusObject() }
  );
};

// Return a plain object instead of a Map for easier JSON serialization
const getModelStatusObject = (): Record<
  string,
  { available: boolean; cooldownRemaining: number }
> => {
  const status: Record<
    string,
    { available: boolean; cooldownRemaining: number }
  > = {};

  modelStatus.forEach((value, key) => {
    const now = Date.now();
    const cooldownRemaining = Math.max(0, value.cooldownUntil - now);

    // Auto-reset models whose cooldown has expired
    if (cooldownRemaining === 0 && !value.available) {
      modelStatus.set(key, { available: true, cooldownUntil: 0 });
    }

    status[key] = {
      available: value.available || cooldownRemaining === 0,
      cooldownRemaining: Math.ceil(cooldownRemaining / 1000), // in seconds
    };
  });

  return status;
};

// Export status function
export const getModelStatus = getModelStatusObject;
