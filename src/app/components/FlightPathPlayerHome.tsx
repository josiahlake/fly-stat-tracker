"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PlayerHomeData = {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  teamName: string | null;
  seasonName: string | null;
  gamesTotal: number;
  gamesUsed: number;
};

type Props = {
  playerId: string;
  onStartGame?: () => void;
};

export default function FlightPathPlayerHome({
  playerId,
  onStartGame,
}: Props) {
  const [data, setData] = useState<PlayerHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlayerHome() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("Please sign in again.");
        }

        const { data: player, error: playerError } = await supabase
          .from("flight_players")
          .select("id, first_name, last_name")
          .eq("id", playerId)
          .single();

        if (playerError) throw playerError;

        const { data: membership, error: membershipError } = await supabase
          .from("flight_team_memberships")
          .select(`
            jersey_number,
            teams (
              display_name
            ),
            seasons (
              name
            )
          `)
          .eq("player_id", playerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;

        const { data: entitlement, error: entitlementError } = await supabase
          .from("flight_entitlements")
          .select("games_total, games_used")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (entitlementError) throw entitlementError;

        setData({
          playerId: player.id,
          firstName: player.first_name,
          lastName: player.last_name,
          jerseyNumber: membership?.jersey_number ?? null,
          teamName:
            (membership?.teams as { display_name?: string } | null)
              ?.display_name ?? null,
          seasonName:
            (membership?.seasons as { name?: string } | null)?.name ?? null,
          gamesTotal: entitlement?.games_total ?? 0,
          gamesUsed: entitlement?.games_used ?? 0,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Flight Path."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPlayerHome();
  }, [playerId]);

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#050505",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            letterSpacing: "0.24em",
            color: "#777777",
            fontWeight: 800,
          }}
        >
          LOADING PLAYER...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#050505",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>Unable to load player.</h2>
          <p style={{ color: "#999999" }}>{error}</p>
        </div>
      </main>
    );
  }

  const gamesRemaining = Math.max(data.gamesTotal - data.gamesUsed, 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#ffffff",
        padding: "32px 20px 56px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "560px",
          margin: "0 auto",
        }}
      >
        <header style={{ marginBottom: "30px" }}>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.26em",
              color: "#777777",
              fontWeight: 800,
              marginBottom: "10px",
            }}
          >
            THE FLY ACADEMY
          </div>

          <div
            style={{
              fontSize: "32px",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Flight Path
          </div>

          <div
            style={{
              color: "#8d8d8d",
              fontSize: "14px",
            }}
          >
            Track your game. See your journey.
          </div>
        </header>

        <div
          style={{
            border: "1px solid #292929",
            borderRadius: "24px",
            padding: "26px",
            background: "#0d0d0d",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              color: "#777777",
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              marginBottom: "8px",
            }}
          >
            PLAYER
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "30px",
              lineHeight: 1.05,
              fontWeight: 900,
              textTransform: "uppercase",
            }}
          >
            {data.firstName} {data.lastName}
            {data.jerseyNumber ? ` · #${data.jerseyNumber}` : ""}
          </h1>

          <div
            style={{
              marginTop: "10px",
              color: "#a0a0a0",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            {data.teamName ?? "No team assigned"}
            {data.seasonName ? ` · ${data.seasonName}` : ""}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #292929",
            borderRadius: "24px",
            padding: "26px",
            background: "#0d0d0d",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              color: "#777777",
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              marginBottom: "8px",
            }}
          >
            YOUR ACCESS
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: 900,
              marginBottom: "4px",
            }}
          >
            {gamesRemaining}
          </div>

          <div
            style={{
              color: "#a0a0a0",
              fontSize: "14px",
              marginBottom: "22px",
            }}
          >
            {gamesRemaining === 1 ? "free game remaining" : "free games remaining"}
          </div>

         <button
  type="button"
  onClick={onStartGame}
  style={{
              width: "100%",
              border: "none",
              borderRadius: "14px",
              padding: "17px",
              background: "#ffffff",
              color: "#000000",
              fontSize: "15px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            START GAME →
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            ["GAMES", "0"],
            ["PPG", "0.0"],
            ["RPG", "0.0"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid #292929",
                borderRadius: "18px",
                padding: "18px 14px",
                background: "#0d0d0d",
              }}
            >
              <div
                style={{
                  color: "#777777",
                  fontSize: "9px",
                  letterSpacing: "0.15em",
                  fontWeight: 800,
                  marginBottom: "8px",
                }}
              >
                {label}
              </div>

              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 900,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            border: "1px solid #292929",
            borderRadius: "24px",
            padding: "24px",
            background: "#0d0d0d",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              color: "#777777",
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              marginBottom: "12px",
            }}
          >
            RECENT GAMES
          </div>

          <div
            style={{
              color: "#9a9a9a",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            No games tracked yet.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #292929",
            borderRadius: "24px",
            padding: "24px",
            background: "#0d0d0d",
          }}
        >
          <div
            style={{
              color: "#777777",
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              marginBottom: "14px",
            }}
          >
            YOUR FLIGHT PATH
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#ffffff",
                marginTop: "5px",
                flexShrink: 0,
              }}
            />

            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "15px",
                  marginBottom: "3px",
                }}
              >
                {data.seasonName ?? "Current Season"}
              </div>

              <div
                style={{
                  color: "#969696",
                  fontSize: "14px",
                }}
              >
                {data.teamName ?? "Team not assigned"}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: "24px",
            color: "#5f5f5f",
            fontSize: "10px",
            letterSpacing: "0.08em",
          }}
        >
          PRIVATE BY DEFAULT. SHARED BY CHOICE.
        </div>
      </section>
    </main>
  );
}
