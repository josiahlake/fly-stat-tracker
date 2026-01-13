import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

// ✅ Do NOT set apiVersion here (avoids TS mismatch issues)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

type Plan = "single" | "pack_15" | "annual";

const PLAN_TO_ENV_KEY: Record<Plan, string> = {
  single: "STRIPE_PRICE_SINGLE_GAME",
  pack_15: "STRIPE_PRICE_PACK_15",
  annual: "STRIPE_PRICE_ANNUAL_23",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { plan?: Plan };
    const plan = body?.plan;

    if (!plan || !["single", "pack_15", "annual"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const envKey = PLAN_TO_ENV_KEY[plan];
    const priceId = process.env[envKey];

    if (!priceId) {
      return NextResponse.json(
        { error: `Missing env var ${envKey}` },
        { status: 500 }
      );
    }

    const proto = req.headers.get("x-forwarded-proto") || "http";
const host = req.headers.get("host");
const origin = host ? `${proto}://${host}` : "http://localhost:3000";


    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${origin}/?canceled=1`,

      metadata: { plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout create error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Checkout create failed" },
      { status: 500 }
    );
  }
}
