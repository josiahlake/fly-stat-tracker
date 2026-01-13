"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Plan = "single" | "pack_15" | "annual";

/**
 * IMPORTANT:
 * This MUST match the exact localStorage key your GameTracker.tsx uses.
 * In GameTracker.tsx search for: STORAGE_KEY_ENT
 * Copy that string value here.
 */
const STORAGE_KEY_ENT = "REPLACE_WITH_YOUR_GAME_TRACKER_STORAGE_KEY";

type Entitlements = {
  plan: "free" | "credits" | "annual";
  creditsRemaining: number;
  freeSavesUsed: number;
  updatedAt: number;
  singleCreditsUsed: number;
};

// safe parse helper
function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadEnt(): Entitlements {
  const fallback: Entitlements = {
    plan: "free",
    creditsRemaining: 0,
    freeSavesUsed: 0,
    updatedAt: Date.now(),
    singleCreditsUsed: 0,
  };

  const raw = safeParse<any>(localStorage.getItem(STORAGE_KEY_ENT), null);

  if (!raw || typeof raw !== "object") return fallback;

  // If already in the new shape
  if (
    typeof raw.plan === "string" &&
    typeof raw.creditsRemaining === "number" &&
    typeof raw.freeSavesUsed === "number"
  ) {
    return {
      plan: raw.plan,
      creditsRemaining: Number(raw.creditsRemaining || 0),
      freeSavesUsed: Number(raw.freeSavesUsed || 0),
      updatedAt: Number(raw.updatedAt || Date.now()),
      singleCreditsUsed: Number(raw.singleCreditsUsed ?? 0),
    };
  }

  return fallback;
}

function saveEnt(e: Entitlements) {
  localStorage.setItem(STORAGE_KEY_ENT, JSON.stringify(e));
}

function applyPlanToEnt(e: Entitlements, plan: Plan) {
  if (plan === "annual") {
    e.plan = "annual";
    e.updatedAt = Date.now();
    return;
  }

  // single + pack_15 both become "credits"
  e.plan = "credits";
  if (plan === "single") e.creditsRemaining += 1;
  if (plan === "pack_15") e.creditsRemaining += 15;
  e.updatedAt = Date.now();
}

export default function UpgradeSuccessPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finalizing your purchase...");

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      router.replace("/");
      return;
    }

    (async () => {
      try {
        setMsg("Verifying payment...");

        const res = await fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }), // MUST be { sessionId }
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setMsg(data?.error || "Could not verify payment.");
          setTimeout(() => router.replace("/"), 1200);
          return;
        }

        if (!data?.paid || !data?.plan) {
          setMsg("Payment not completed. If you were charged, contact support.");
          setTimeout(() => router.replace("/"), 1500);
          return;
        }

        // Apply entitlement
        const ent = loadEnt();

        // Optional: prevent double-apply for same session
        // If you want this protection, store lastSessionId.
        // For simplicity, we’ll store it as a separate key.
        const redeemedKey = "fly_redeemed_sessions_v1";
        const redeemed = safeParse<string[]>(localStorage.getItem(redeemedKey), []);
        if (redeemed.includes(sessionId)) {
          setMsg("Purchase already applied. Returning to Stat Tracker...");
          setTimeout(() => router.replace("/"), 900);
          return;
        }

        applyPlanToEnt(ent, data.plan as Plan);
        saveEnt(ent);

        localStorage.setItem(
          redeemedKey,
          JSON.stringify([sessionId, ...redeemed].slice(0, 50))
        );

        // Optional: a “flash” message the Stat Tracker can show after redirect
        localStorage.setItem(
          "fly_purchase_flash_v1",
          JSON.stringify({ plan: data.plan, at: Date.now() })
        );

        // Confirmation UX
        const planLabel =
          data.plan === "single"
            ? "1 Game Save"
            : data.plan === "pack_15"
            ? "15-Game Pack"
            : "1-Year Unlimited";

        setMsg(`✅ Purchase confirmed: ${planLabel}. Returning to Stat Tracker...`);
        setTimeout(() => router.replace("/"), 1200);
      } catch (err: any) {
        setMsg(err?.message || "Unexpected error. Returning...");
        setTimeout(() => router.replace("/"), 1200);
      }
    })();
  }, [router]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Purchase Successful</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </div>
  );
}
