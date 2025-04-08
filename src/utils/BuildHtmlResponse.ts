import { Request } from "express";

// HTML Response Builder
export const BuildHtmlResponse = (req: Request, secureUrl: string, prompt: string) => {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <!-- Essential OpenGraph tags for WhatsApp - using minimal set -->
    <meta property="og:title" content="${encodeHTML(prompt)}" />
    <meta property="og:image" content="${secureUrl}" />
    <meta property="og:description" content="AI generated image: ${encodeHTML(prompt)}" />
    
    <!-- Twitter card tags (also help with WhatsApp) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${secureUrl}" />
    
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${encodeHTML(prompt)}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #f5f5f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      
      .image-container {
        position: relative;
        max-width: 100%;
        margin: 20px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        overflow: hidden;
        background-color: #fff;
      }
      
      .skeleton-loader {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: loading 1.5s infinite;
        z-index: 1;
      }
      
      .image {
        display: block;
        max-width: 100%;
        height: auto;
        position: relative;
        z-index: 2;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .prompt-text {
        padding: 12px;
        text-align: center;
        font-size: 16px;
        color: #333;
        word-wrap: break-word;
      }
      
      @keyframes loading {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    </style>
  </head>
  <body>
    <div class="image-container">
      <div class="skeleton-loader" id="skeleton"></div>
      <img class="image" id="generatedImage" src="${secureUrl}" alt="${encodeHTML(prompt)}" />
      <div class="prompt-text">${encodeHTML(prompt)}</div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const image = document.getElementById('generatedImage');
        const skeleton = document.getElementById('skeleton');
        
        // Hide skeleton and show image when loaded
        image.onload = function() {
          skeleton.style.display = 'none';
          image.style.opacity = '1';
        };
        
        // Handle loading error
        image.onerror = function() {
          // Try loading again
          setTimeout(() => {
            image.src = "${secureUrl}?retry=" + new Date().getTime();
          }, 1000);
        };
        
        // Force hide skeleton after 10 seconds (fallback)
        setTimeout(() => {
          skeleton.style.display = 'none';
          image.style.opacity = '1';
        }, 10000);
      });
    </script>
  </body>
</html>`;
};

// HTML utility function
export const encodeHTML = (str: string): string => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}