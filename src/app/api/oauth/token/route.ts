import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/oauth/server";

export async function POST(request: NextRequest) {
  let body: Record<string, string> = {};

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      body[key] = String(value);
    });
  } else if (contentType.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Malformed JSON body" },
        { status: 400 }
      );
    }
  } else {
    // Try both
    try {
      const text = await request.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        body[key] = value;
      });
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Unsupported content type" },
        { status: 400 }
      );
    }
  }

  const {
    grant_type: grantType,
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  } = body;

  if (grantType !== "authorization_code") {
    return NextResponse.json(
      {
        error: "unsupported_grant_type",
        error_description: "Only authorization_code grant is supported",
      },
      { status: 400 }
    );
  }

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters (code, client_id, redirect_uri, code_verifier)",
      },
      { status: 400 }
    );
  }

  try {
    const tokenResult = await exchangeCodeForToken({
      code,
      clientId,
      redirectUri,
      codeVerifier,
    });

    return NextResponse.json({
      access_token: tokenResult.accessToken,
      token_type: "Bearer",
      expires_in: tokenResult.expiresIn,
      agent_id: tokenResult.agentId,
      pod_id: tokenResult.podId,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: err instanceof Error ? err.message : "Token exchange failed",
      },
      { status: 400 }
    );
  }
}
