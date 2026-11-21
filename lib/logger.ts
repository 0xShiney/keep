import pino, { type Logger } from "pino";
import { getEnv } from "@/lib/env";

let root: Logger | null = null;

export function getLogger(): Logger {
  if (root) return root;

  const env = getEnv();
  const isDev = env.NODE_ENV === "development";

  root = pino({
    level: env.LOG_LEVEL,
    base: { service: "keep" },
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers['set-cookie']",
        "*.access_token",
        "*.refresh_token",
        "*.token",
        "*.password",
        "*.code",
        "*.code_verifier",
        "*.content",
        "*.patch",
      ],
      censor: "[redacted]",
    },
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
          },
        }
      : {}),
  });

  return root;
}

export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
