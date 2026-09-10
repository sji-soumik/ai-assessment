import { backendUrl } from "@/lib/backend";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${backendUrl()}/health`, { cache: "no-store" });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
