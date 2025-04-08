import { Request } from "express";

const BuildHtmlResponse = (req: Request, secureUrl: string, prompt: string) => {
  return `      
  <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <!-- Standard OpenGraph tags for better compatibility -->
        <meta property="og:title" content="${encodeHTML(prompt)}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${req.protocol}://${req.get("host")}${
    req.originalUrl
  }" />
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
    </html>`;
};

function encodeHTML(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default BuildHtmlResponse;
