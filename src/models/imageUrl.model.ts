import mongoose, { Schema, Document } from 'mongoose';
import { ImageUrl } from '../types/imageUrl.types.ts';

interface ImageUrlDocument extends ImageUrl, Document {}

const imageUrlSchema = new Schema({
    prompt: { type: String, required: true, index: true, unique: true },
    imageSecureUrl: { type: String, required: true },
    usedCounter: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    size: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true }
})

export const ImageUrlModel = mongoose.model<ImageUrlDocument>('ImageUrl', imageUrlSchema);