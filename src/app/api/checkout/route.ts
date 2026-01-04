import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

type Plan = "single_game" | "season" | "unlimited_monthly" | "unlimited_annual";

function getPriceId(plan: Plan) {
  switch (plan) {
    case "single_game":
      return process.env.STRIPE_PRICE_SINGLE_GAME!;
    case "season":
      return process.env.STRIPE_PRICE_SEASON_PASS!;
    case "unlimited_monthly":
      return process.env.STRIPE_PRICE_UNLIMITED_MONTHLY!;
    case "unlimited_annual":
      return process.env.STRIPE_PRICE_UNLIMITED_ANNUAL!;
    default:
      throw new Error("Invalid plan");
  }
}

export async function POST(req: Request) {
  try {
    const { plan } = (await req.json()) as { plan: Plan };

    const priceId = getPriceId(plan);

    const isSubscription = plan === "unlimited_monthly" || plan === "unlimited_annual";
    const mode: Stripe.Checkout.SessionCreateParams.Mode = isSubscription
      ? "subscription"
      : "payment";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/upgrade/cancel`,
      metadata: { plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err?.message || err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
