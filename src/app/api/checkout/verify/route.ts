import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: Request) {
  try {
    // Be robust: body might be empty or not JSON
    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    // Accept both camelCase and snake_case
    const sessionId: string | undefined = body.sessionId ?? body.session_id;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId", receivedBody: body },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid";

    const plan = (session.metadata?.plan || null) as
      | "single"
      | "pack_15"
      | "annual"
      | null;

    return NextResponse.json({
      paid,
      plan,
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("Verify error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Verify failed" },
      { status: 500 }
    );
  }
}
