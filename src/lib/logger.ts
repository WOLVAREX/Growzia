type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: unknown): void {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [${level.toUpperCase()}] ${message}`;
  if (level === "error") {
    if (meta === undefined) console.error(line);
    else console.error(line, meta);
    return;
  }
  if (level === "warn") {
    if (meta === undefined) console.warn(line);
    else console.warn(line, meta);
    return;
  }
  if (meta === undefined) console.log(line);
  else console.log(line, meta);
}

export const logger = {
  info: (message: string, meta?: unknown): void => emit("info", message, meta),
  warn: (message: string, meta?: unknown): void => emit("warn", message, meta),
  error: (message: string, meta?: unknown): void => emit("error", message, meta),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
