export class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, message);
export const unauthorized = (message = "Unauthorized"): HttpError => new HttpError(401, message);
export const forbidden = (message = "Forbidden"): HttpError => new HttpError(403, message);
export const notFound = (message = "Not found"): HttpError => new HttpError(404, message);
export const tooManyRequests = (message = "Too many requests"): HttpError => new HttpError(429, message);
export const serviceUnavailable = (message = "Service unavailable"): HttpError => new HttpError(503, message);
