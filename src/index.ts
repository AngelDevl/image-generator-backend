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
      "https://cxxw9wm0-8080.euw.devtunnels.ms",
      "https://image-generator-backend-production-9443.up.railway.app",
      "https://cxxw9wm0-8080.euw.devtunnels.ms",
      "https://melts.cc"
    ],
    credentials: true,
  })
);

app.use("/favicon.ico", express.static("public/images/image-gen-icon.png"));
app.use("/app", express.static(public_dir));

app.use("/", generateRouter);

app.listen(PORT, async () => {
  await connectToDatabase();
  console.log(`Server is listening to port: ${PORT}`)
});
