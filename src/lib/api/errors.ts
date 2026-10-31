export const errorStatus = {
  VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  VERSION_CONFLICT: 409, INVALID_TRANSITION: 409, IDEMPOTENCY_CONFLICT: 409,
  DISCOUNT_EXHAUSTED: 409, PAYMENT_EXCEEDS_BALANCE: 409, NOT_DUE: 409,
  PRECONDITION_REQUIRED: 428, RATE_LIMITED: 429, INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof errorStatus;
export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly fields: Record<string, string> = {}) {
    super(message);
    this.name = 'AppError';
  }
}
