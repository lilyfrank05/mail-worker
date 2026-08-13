/** Validated inbound request payload. */
export interface SendEmailRequest {
  to: string;
  cc?: string;
  subject: string;
  text: string;
}

/** Subset of the Cloudflare Email Service binding interface used by this worker. */
export interface SendEmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    cc?: string;
  }): Promise<{ messageId: string }>;
}

/** Worker bindings and secrets. EMAIL_WORKER_API_KEY and FROM_ADDRESS are set at runtime. */
export type Env = {
  EMAIL: SendEmailBinding;
  HEARTBEAT_KV: KVNamespace;
  EMAIL_WORKER_API_KEY: string;
  FROM_ADDRESS: string;
};
