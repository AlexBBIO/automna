/**
 * Gateway Proxy Route
 * 
 * Proxies HTTP requests to the Fly.io gateway to avoid CORS issues.
 * Paths: /api/gateway/keepalive, /api/gateway/history, etc.
 */

import { NextRequest, NextResponse } from "next/server";

const FLY_GATEWAY_URL = process.env.FLY_GATEWAY_URL || "https://automna-gateway.fly.dev";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  
  // Build target URL
  const targetUrl = new URL(`${FLY_GATEWAY_URL}/api/${pathStr}`);
  
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
    console.error("[gateway-proxy] Error:", error);
    return NextResponse.json(
      { error: "Gateway request failed" },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  
  // Build target URL
  const targetUrl = new URL(`${FLY_GATEWAY_URL}/api/${pathStr}`);
  
  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });
  
  try {
    const body = await request.text();
    
    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body || undefined,
    });
    
    const data = await response.text();
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[gateway-proxy] Error:", error);
    return NextResponse.json(
      { error: "Gateway request failed" },
      { status: 502 }
    );
  }
}
