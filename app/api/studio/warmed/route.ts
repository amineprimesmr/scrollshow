import { readStudioSession as readSession } from "@/lib/auth";
import { readStore, updateStore } from "@/lib/store";
import { findListing, WARMED_CATALOG } from "@/lib/warmed";
import type { WarmedOrder } from "@/lib/types";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  listingId: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(20),
  niche: z.string().trim().max(80).default(""),
  note: z.string().trim().max(600).default(""),
});

const cancelSchema = z.object({
  id: z.string().min(1),
  action: z.literal("cancel"),
});

function ordersOf(orders: WarmedOrder[] | undefined, userId: string) {
  return (orders || [])
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await readStore();
  return NextResponse.json({ catalog: WARMED_CATALOG, orders: ordersOf(data.warmedOrders, session.id) });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!findListing(parsed.data.listingId)) return NextResponse.json({ error: "unknown_listing" }, { status: 404 });

  const now = new Date().toISOString();
  const order: WarmedOrder = {
    id: randomUUID(),
    userId: session.id,
    listingId: parsed.data.listingId,
    quantity: parsed.data.quantity,
    niche: parsed.data.niche,
    note: parsed.data.note,
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
  const orders = await updateStore((data) => {
    data.warmedOrders ||= [];
    data.warmedOrders.push(order);
    return ordersOf(data.warmedOrders, session.id);
  });
  return NextResponse.json({ order, orders });
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const result = await updateStore((data) => {
    const order = (data.warmedOrders || []).find((item) => item.id === parsed.data.id && item.userId === session.id);
    if (!order) return null;
    if (order.status === "delivered") return "delivered" as const;
    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();
    return ordersOf(data.warmedOrders, session.id);
  });
  if (result === null) return NextResponse.json({ error: "missing" }, { status: 404 });
  if (result === "delivered") return NextResponse.json({ error: "delivered" }, { status: 409 });
  return NextResponse.json({ orders: result });
}
