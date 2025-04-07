export class ApiError extends Error {
  errorCode: number;
  statusCode: number;
  toPass: any;

  constructor(
    errorCode: number,
    message: string,
    statusCode: number,
    toPass: any = null
  ) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.toPass = toPass;

    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
