import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

type Plan = "single_game" | "season";

function getPriceId(plan: Plan) {
  switch (plan) {
    case "single_game":
      return process.env.STRIPE_PRICE_SINGLE_GAME || "";
    case "season":
      return process.env.STRIPE_PRICE_SEASON_PASS || "";
  }
}

export async function POST(req: Request) {
  try {
    const { plan } = (await req.json()) as { plan: Plan };

    const priceId = getPriceId(plan);

    if (!priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price env var for plan: ${plan}` },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/upgrade/cancel`,
      metadata: { plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Checkout failed" }, { status: 500 });
  }
}