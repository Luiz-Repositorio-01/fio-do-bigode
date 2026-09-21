export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SLOT_UNAVAILABLE"
  | "NO_PROFESSIONAL"
  | "CUSTOMER_OVERLAP"
  | "TOO_LATE"
  | "INVALID_STATUS"
  | "PRICE_REQUIRED"
  | "LOYALTY"
  | "CONFLICT";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
