import { backendUrl } from "@/lib/backend";
import type { ChatErrorResponse, ChatResponse } from "@/lib/types";

export async function POST(request: Request): Promise<Response> {
  let body: { message?: string; userId?: string; scenario?: string };
  try {
    body = (await request.json()) as { message?: string; userId?: string; scenario?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" } satisfies ChatErrorResponse, {
      status: 400,
    });
  }

  if (!body.message?.trim()) {
    return Response.json({ error: "missing 'message' field" } satisfies ChatErrorResponse, {
      status: 400,
    });
  }

  try {
    const upstream = await fetch(`${backendUrl()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: body.message.trim(),
        userId: body.userId ?? "frontend",
        ...(body.scenario ? { scenario: body.scenario } : {}),
      }),
    });

    const data = (await upstream.json()) as ChatResponse | ChatErrorResponse;

    if (!upstream.ok) {
      return Response.json(data, { status: upstream.status });
    }

    return Response.json(data);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message.includes("ECONNREFUSED")
          ? "Backend agent is not running. Start it with: cd backend && bun run dev"
          : err.message
        : "Failed to reach backend";
    return Response.json({ error: message } satisfies ChatErrorResponse, { status: 502 });
  }
}
