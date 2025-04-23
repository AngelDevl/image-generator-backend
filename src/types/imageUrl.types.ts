export interface ImageUrl {
  prompt: string;
  imageSecureUrl: string;
  usedCounter?: number;
  timestamp?: Date;
  size: number;
  width: number;
  height: number;
}
