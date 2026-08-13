import { authenticate } from "./auth";
import { validateEmailRequest } from "./validate";
import type { Env } from "./types";

const MAX_REQUEST_BYTES = 1024 * 1024; // 1 MiB

function json(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/send-email") {
      return json({ success: false, error: "Not found" }, 404);
    }
    if (request.method !== "POST") {
      return json({ success: false, error: "Method not allowed" }, 405, {
        Allow: "POST",
      });
    }

    if (!env.EMAIL_WORKER_API_KEY || !env.FROM_ADDRESS) {
      return json(
        { success: false, error: "Server misconfigured" },
        500,
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return json({ success: false, error: "Request body too large" }, 413);
    }

    if (!authenticate(request, env.EMAIL_WORKER_API_KEY)) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const rawBody = await request.text();
    console.log(
      "Request:",
      request.method,
      url.pathname,
      "Content-Type:",
      request.headers.get("content-type"),
      "Body:",
      rawBody,
    );

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    console.log("Parsed payload:", JSON.stringify(payload));

    const validated = validateEmailRequest(payload);
    if (!validated.ok) {
      return json({ success: false, error: validated.error }, 400);
    }

    try {
      const message: {
        to: string;
        from: string;
        subject: string;
        text: string;
        cc?: string;
      } = {
        to: validated.value.to,
        from: env.FROM_ADDRESS,
        subject: validated.value.subject,
        text: validated.value.text,
      };
      if (validated.value.cc) {
        message.cc = validated.value.cc;
      }

      const result = await env.EMAIL.send(message);
      return json({ success: true, messageId: result.messageId }, 200);
    } catch (error) {
      // Cloudflare Email Service errors carry a code and message
      const err = error as { code?: string; message?: string };
      const code = err.code;
      switch (code) {
        case "E_RATE_LIMIT_EXCEEDED":
        case "E_DAILY_LIMIT_EXCEEDED":
          return json({ success: false, error: "Rate limit exceeded" }, 429);
        case "E_SENDER_NOT_VERIFIED":
        case "E_SENDER_DOMAIN_NOT_AVAILABLE":
          return json(
            { success: false, error: "Sender not verified or unavailable" },
            400,
          );
        case "E_RECIPIENT_NOT_ALLOWED":
        case "E_RECIPIENT_SUPPRESSED":
          return json({ success: false, error: "Recipient rejected" }, 400);
        case "E_VALIDATION_ERROR":
        case "E_FIELD_MISSING":
          return json(
            { success: false, error: "Email service rejected the message" },
            400,
          );
        default:
          console.error("Email send failed:", code, err.message);
          return json(
            { success: false, error: "Failed to send email" },
            500,
          );
      }
    }
  },
};
