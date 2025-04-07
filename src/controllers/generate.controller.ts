import { generateImage } from "../services/gemini.service.ts";
import tryCatch from "../utils/tryCatch.ts";
import cloudinary from "../lib/cloudinary.ts";


export const generateClient = tryCatch(async (req, res) => {
    const prompt = req.params.prompt;
    console.log(prompt)

    const AiResponse = await generateImage(prompt);
    res.set("Content-Type", "image/png");
    res.send(AiResponse);  
});


export const generateServer = tryCatch(async (req, res) => {
  // const prompt = req.params.prompt;
  // console.log("Generating:", prompt);

  // const AiResponse = await generateImage(prompt);
    
  // if (!AiResponse?.success || !AiResponse.imageBuffer) {
  //   res.json({ success: false, message: AiResponse?.message });
  //   return;
  // }

  // // Save the image so we can reference it in Open Graph meta tag
  // const cloudinary_response = await cloudinary.uploader.upload(
  //   `data:image/png;base64,${AiResponse.imageBuffer.toString('base64')}`, 
  //   { resource_type: "auto" }
  // );

  // const secure_url = cloudinary_response.secure_url;
  const secure_url = "https://res.cloudinary.com/dgxojyded/image/upload/v1744027268/g6vbo8yttutgn1lv61k6.png";
  const prompt = "monkey";
  res.set("Content-Type", "text/html");
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta property="og:title" content="${prompt}" />
        <meta property="og:image" content="${secure_url}" />
        <meta property="og:description" content="Generated image for '${prompt}'" />
        <meta name="twitter:card" content="summary_large_image" />
        <title>${prompt}</title>
      </head>
      <body style="background:black; color:white; text-align:center;">
        <h2>"${prompt}"</h2>
        <!-- Placeholder Image (initially shown) -->
        <img id="image" src="https://via.placeholder.com/600x400.png?text=Loading..." style="max-width:90%; border-radius:1rem;" />
        <br/><br/>
        <a href="/" style="color:white; border:1px solid white; padding:6px 12px; border-radius:8px;">Home</a>
        
        <script>
          // Replace the placeholder image with the actual image once it's ready
          window.onload = function() {
            var imgElement = document.getElementById('image');
            imgElement.src = "${secure_url}";
          };
        </script>
      </body>
    </html>
  `);
  });
