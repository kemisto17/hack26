import { AppError } from "../../lib/api/errors";

export type CatalogErrorCode = "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_ERROR";
export class CatalogError extends AppError {
  constructor(code: CatalogErrorCode, message: string) {
    super(code, message);
    this.name = "CatalogError";
  }
}
