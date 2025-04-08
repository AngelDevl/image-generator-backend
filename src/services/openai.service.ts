import { OpenAI } from "openai";
import https from "https";

export async function generateImageFromPromptDalle(
  prompt: string
): Promise<AiResponse> {
  const api_key = process.env.OPEN_AI_API_KEY;
  if (!api_key)
    return {
      success: false,
      imageBuffer: null,
      message: "No Api key",
    };

  const openai = new OpenAI({ apiKey: api_key });

  try {
    const dallePrompt = prompt.replace(/-/g, " ");

    // Request image generation from DALL·E 3
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: dallePrompt,
      n: 1,
      size: "1024x1024",
      response_format: "url", // or 'b64_json' if you want base64 directly
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return {
        success: false,
        imageBuffer: null,
        message: "No image URL returned from OpenAI.",
      };
    }

    // Download the image as a buffer
    const imageBuffer = await downloadImageAsBuffer(imageUrl);

    return {
      success: true,
      imageBuffer,
      message: null,
    };
  } catch (error: any) {
    return {
      success: false,
      imageBuffer: null,
      message: error?.message || "Unknown error generating image with DALL·E 3",
    };
  }
}

// Helper function to download image from URL into a buffer
async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const data: Uint8Array[] = [];

      res.on("data", (chunk) => {
        data.push(chunk);
      });

      res.on("end", () => {
        resolve(Buffer.concat(data));
      });

      res.on("error", (err) => {
        reject(err);
      });
    });
  });
}
