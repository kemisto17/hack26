/** Adapt to D1 AppError at the HTTP boundary; never return raw DB errors. */
export class SubscriptionError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT", message: string) {
    super(message);
    this.name = "SubscriptionError";
  }
}
