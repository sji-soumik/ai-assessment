import type { ChatErrorResponse, ChatResponse, HealthResponse } from "./types";

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as HealthResponse;
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function sendChat(message: string): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = (await res.json()) as ChatResponse | ChatErrorResponse;

  if (!res.ok) {
    throw new Error("error" in data ? data.error : `Request failed (${res.status})`);
  }

  return data as ChatResponse;
}
