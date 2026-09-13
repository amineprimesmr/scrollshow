import { NextResponse } from "next/server";
/** No authorization code is accepted until an approved provider OAuth client has a complete flow. */
export async function GET() { return NextResponse.json({ error: "provider_oauth_not_enabled" }, { status: 409 }); }
