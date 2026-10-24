import { stdout, stderr } from "node:process";

export type LogFields = Record<string, unknown>;
const SECRET_KEYS = /password|token|secret|cookie|authorization|private.?key|code/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : redact(v)]));
  return value;
}
function write(level: string, fields: LogFields, message?: string) { stdout.write(`${JSON.stringify({ level, ...redact(fields) as object, message })}\n`); }
export function createLogger() {
  return {
    info(fields: LogFields, message?: string) { write("info", fields, message); },
    warn(fields: LogFields, message?: string) { write("warn", fields, message); },
    error(fields: LogFields, message?: string) { stderr.write(`${JSON.stringify({ level: "error", ...redact(fields) as object, message })}\n`); },
  };
}
