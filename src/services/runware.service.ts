import { Runware } from "@runware/sdk-js";

export interface AiResponse {
  success: boolean;
  imageBuffer: Buffer | null;
  message: string | null;
}

export async function generateImageFromPrompt(
  prompt: string
): Promise<AiResponse> {
  try {
    // Initialize the Runware SDK with your API key
    const api_key = process.env.RUNWARE_API_KEY;
    if (!api_key)
      return {
        success: false,
        imageBuffer: null,
        message: "Unknown error occurred.",
      };

    const runware = new Runware({ apiKey: api_key });

    // Ensure the connection is established
    await runware.ensureConnection();

    // Prepare the image generation parameters
    const positivePrompt = prompt.replace(/-/g, " "); // Replace dashes with spaces for the prompt

    const images = await runware.requestImages({
      positivePrompt: positivePrompt,
      width: 512, // Customize the image width
      height: 512, // Customize the image height
      model: "rundiffusion:130@100", // Replace with your model ID
      outputType: "base64Data", // The format to receive the image
      outputFormat: "PNG", // The desired output format
      numberResults: 1, // Generate one image
    });

    // Check if images are returned
    if (images && images.length > 0 && images[0].imageBase64Data) {
      const imageBuffer = Buffer.from(images[0].imageBase64Data, "base64");
      return {
        success: true,
        imageBuffer,
        message: null,
      };
    }

    return {
      success: false,
      imageBuffer: null,
      message: "No image data found in response.",
    };
  } catch (error: any) {
    // Catch errors and return a failure response
    return {
      success: false,
      imageBuffer: null,
      message: error?.message || "Unknown error occurred.",
    };
  }
}
