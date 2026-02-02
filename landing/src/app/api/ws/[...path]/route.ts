/**
 * WebSocket API Proxy Route
 * 
 * Proxies HTTP requests to the Fly.io gateway's /ws/api/ endpoints.
 * Paths: /api/ws/history, etc.
 */

import { NextRequest, NextResponse } from "next/server";

const FLY_GATEWAY_URL = process.env.FLY_GATEWAY_URL || "https://automna-gateway.fly.dev";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  
  // Build target URL - note: /ws/api/ path
  const targetUrl = new URL(`${FLY_GATEWAY_URL}/ws/api/${pathStr}`);
  
  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });
  
  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[ws-proxy] Error:", error);
    return NextResponse.json(
      { error: "Gateway request failed" },
      { status: 502 }
    );
  }
}
