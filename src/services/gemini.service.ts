import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../Errors/ApiError.ts";
import { ERROR_CODES } from "../Errors/ErrorCodes.ts";


export const generateImage = async (prompt: string): Promise<AiResponse> => {
  try {
    console.log("key: ", process.env.GEMINI_API_KEY)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = `Hi, can you create an image of a ${prompt} please refer to the content "${prompt}" as the image content`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
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
          console.log(part.text);
          return { success: false, imageBuffer: null, message: part.text }
        } else if ((part as any).inlineData) {
          const imageData = (part as any).inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          return { success: true, imageBuffer: buffer, message: null }
        }
      }

      return { success: false, imageBuffer: null, message: null }
    } else {
      throw new ApiError(
        ERROR_CODES.IMAGE_GENERATION_FAILED,
        "Failed to create image, please try again later",
        400
      )
    }
  } catch (error) {
    throw new ApiError(
      ERROR_CODES.IMAGE_GENERATION_FAILED,
      "Failed to create image, please try again later",
      400,
      error
    )
  }
};