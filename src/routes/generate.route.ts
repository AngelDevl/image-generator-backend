import express from "express";
import { generateClient, generateServer } from "../controllers/generate.controller.ts";

const generateRouter = express.Router();

generateRouter.get("/api/generator/:prompt", generateClient)
generateRouter.get("/:prompt", generateServer)


export default generateRouter;