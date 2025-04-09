import express from "express";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import generateRouter from "./routes/generate.route.ts";
import { connectToDatabase } from "./utils/connectDB.ts";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 8080;

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const public_dir = path.join(__dirname, '..', "public");

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:8080",
      "https://melts.cc",
      "https://v.melts.cc/"
    ],
    credentials: true,
  })
);

app.use("/favicon.ico", express.static("public/images/image-gen-icon.png"));
app.use("/app", express.static(public_dir));

app.get("/ok", (req, res) => {
  const p = `https://v.melts.cc/app/images/Untitled.png`
  res.send(`
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="Funny Cat GIF" />
  <meta property="og:description" content="Check out this hilarious cat!" />
  <meta property="og:image" content=${p} />
  <meta property="og:type" content="website" />
</head>
<body>
  <p>If you see this, you probably opened the preview page directly.</p>
</body>
</html>
  
  `)
})


app.use("/", generateRouter);

app.use((req, res) => {
  res.sendStatus(404)
})

app.listen(PORT, async () => {
  await connectToDatabase();
  console.log(`Server is listening to port: ${PORT}`)
});
