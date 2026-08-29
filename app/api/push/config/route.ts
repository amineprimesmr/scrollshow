import { pushConfigured, vapidPublicKey } from "@/lib/push";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ configured: pushConfigured(), publicKey: vapidPublicKey() });
}
