import { v2 as cloudiniry } from "cloudinary";
import { config } from "dotenv";

config();

cloudiniry.config({
  cloud_name: process.env.CLOUDINAR_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudiniry;
