/** Server-side backend base URL (API routes only — never exposed to the browser). */
export function backendUrl(): string {
  return process.env.BACKEND_URL ?? "http://localhost:3000";
}
