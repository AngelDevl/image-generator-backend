import express from "express";
import { generateClient, gen } from "../controllers/generate.controller.ts";

const generateRouter = express.Router();

generateRouter.get("/api/generator/:prompt", generateClient)
generateRouter.get("/:prompt", gen)


export default generateRouter;