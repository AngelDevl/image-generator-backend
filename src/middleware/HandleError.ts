import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Errors/ApiError.ts";

// Error handler with types for Request and Response
const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`Error occurred on ${req.method} ${req.originalUrl}:`, error);

  // Handle ApiError instances
  if (error instanceof ApiError) {
    const statusCode = error.statusCode || 500;
    const response: any = {
      success: false,
      error: {
        code: error.errorCode,
        message: error.message
      }
    };
    
    // Only include additional data in development environment
    if (process.env.NODE_ENV !== 'production' && error.toPass) {
      response.error['details'] = error.toPass;
    }
    
    return res.status(statusCode).json(response);
  }

  // For all other types of errors
  const statusCode = error.statusCode || 500;
  const errorResponse: any = {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? "An internal server error occurred." 
        : error.message || "Unknown error"
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error['stack'] = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

export default errorHandler;