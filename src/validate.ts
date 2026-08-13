import type { SendEmailRequest } from "./types";

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ADDRESS_LENGTH = 320; // RFC 5321 overall address limit
const MAX_SUBJECT_LENGTH = 998; // RFC 5322 line length limit
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

type ValidationResult =
  | { ok: true; value: SendEmailRequest }
  | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function validateAddress(value: unknown, field: string): string | undefined {
  if (!isNonEmptyString(value)) {
    return `"${field}" must be a non-empty string`;
  }
  if (value.length > MAX_ADDRESS_LENGTH || !EMAIL_ADDRESS_RE.test(value)) {
    return `"${field}" must be a valid email address`;
  }
  return undefined;
}

export function validateEmailRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const record = body as Record<string, unknown>;

  const toError = validateAddress(record.to, "to");
  if (toError) {
    return { ok: false, error: toError };
  }

  if (record.cc !== undefined) {
    const ccError = validateAddress(record.cc, "cc");
    if (ccError) {
      return { ok: false, error: ccError };
    }
  }

  if (!isNonEmptyString(record.subject)) {
    return { ok: false, error: '"subject" must be a non-empty string' };
  }
  if (record.subject.length > MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      error: `"subject" must not exceed ${MAX_SUBJECT_LENGTH} characters`,
    };
  }

  if (!isNonEmptyString(record.text)) {
    return { ok: false, error: '"text" must be a non-empty string' };
  }
  if (byteLength(record.text) > MAX_BODY_BYTES) {
    return { ok: false, error: `"text" must not exceed ${MAX_BODY_BYTES} bytes` };
  }

  return {
    ok: true,
    value: {
      to: record.to as string,
      subject: record.subject as string,
      text: record.text as string,
      ...(record.cc !== undefined ? { cc: record.cc as string } : {}),
    },
  };
}
