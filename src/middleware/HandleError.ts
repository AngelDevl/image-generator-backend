import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Errors/ApiError.ts";
// import { ApiError } from "../Errors/ApiError.ts";
// import { DatabaseError } from "../Errors/DatabaseError.ts";

// Error handler with types for Request and Response
const errorHandler = async (error: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`Error occurred on ${req.method} ${req.originalUrl}:`, error);

    if (error instanceof ApiError) {
        if (error.toPass) {
            console.log(error.toPass.message)
        }
    }

    // if (error instanceof DatabaseError) {

    // }

    // Send a generic error message to the client
    res.status(500).json({
        message: "An internal server error occurred.",
        error: error.message || error
    });
};

export default errorHandler;