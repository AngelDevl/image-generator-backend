export const imageIsBeingGeneratedPreview = (prompt: string) => {
  const promptEncoded = encodeURIComponent(prompt);
  // Need to add a placeholder image URL here
  const placeholderImageUrl = "https://v.melts.cc/app/animations/placeholder.gif";
  
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Image is being generated... Please try sending the url again in 10 seconds</title>
  
          <meta property="og:title" content="Generating your image..." />
          <meta property="og:description" content="We're generating the image for '${prompt}'" />
          <meta property="og:url" content="https://v.melts.cc/${promptEncoded}$" />
          <meta property="og:image" content="${placeholderImageUrl}" />
  
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Generating your image..." />
          <meta name="twitter:description" content="We're generating the image for '${prompt}'" />
          <meta name="twitter:image" content="${placeholderImageUrl}" />
  
          <meta http-equiv="refresh" content="10">
        </head>
      </html>
    `;
};


export const imageIsBeingGenerated = (prompt: string) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Generating image for: ${encodeHTML(prompt)}</title>
        <meta http-equiv="refresh" content="3">
        <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .loading-container {
            text-align: center;
        }
        .loading-spinner {
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        </style>
    </head>
    <body>
        <div class="loading-container">
        <div class="loading-spinner"></div>
        <h2>Your image is being generated</h2>
        <p>This page will automatically refresh when ready (${encodeHTML(
          prompt
        )})</p>
        </div>
    </body>
    </html>`;
};

export const encodeHTML = (str: string): string => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
