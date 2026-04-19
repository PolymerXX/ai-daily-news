import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.PYDANTIC_AI_URL || "http://localhost:8001";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("force_refresh") === "true";

    const url = new URL("/api/news", BACKEND_URL);
    url.searchParams.set("force_refresh", String(forceRefresh));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(180_000), // 3 min timeout for generation
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "AI 服务暂时不可用，请稍后重试"
        : "网络错误，请检查后端服务是否启动";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
