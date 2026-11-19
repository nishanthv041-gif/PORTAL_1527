export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function json404(request: Request) {
  const url = new URL(request.url);
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return NextResponse.json(
    {
      ok: false,
      code: "NOT_FOUND",
      error: `API route '${url.pathname}' was not found.`,
      method: request.method,
      requestId,
    },
    { 
      status: 404,
      headers: {
        "Content-Type": "application/json",
      }
    }
  );
}

export async function GET(request: Request) {
  return json404(request);
}

export async function POST(request: Request) {
  return json404(request);
}

export async function PUT(request: Request) {
  return json404(request);
}

export async function PATCH(request: Request) {
  return json404(request);
}

export async function DELETE(request: Request) {
  return json404(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
