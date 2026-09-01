"use client";

import { useEffect, useState } from "react";
import FlightPathAuth from "./FlightPathAuth";
import FlightPathPlayerSetup from "./FlightPathPlayerSetup";
import FlightPathPlayerHome from "./FlightPathPlayerHome";
import GameTracker from "./GameTracker";
import { supabase } from "../lib/supabase";

type AppState =
  | "loading"
  | "signed-out"
  | "needs-player"
  | "has-player"
  | "tracking-game";

export default function FlightPathApp() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [playerId, setPlayerId] = useState<string | null>(null);

  async function checkAccount() {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setPlayerId(null);
        setAppState("signed-out");
        return;
      }

      const { data: access, error } = await supabase
        .from("flight_player_access")
        .select("player_id")
        .eq("user_id", user.id)
        .limit(1);

      if (error) {
        console.error("Could not load player access:", error);
        setPlayerId(null);
        setAppState("needs-player");
        return;
      }

      if (access && access.length > 0) {
        setPlayerId(access[0].player_id);
        setAppState("has-player");
      } else {
        setPlayerId(null);
        setAppState("needs-player");
      }
    } catch (error) {
      console.error("Flight Path account check failed:", error);
      setPlayerId(null);
      setAppState("signed-out");
    }
  }

  useEffect(() => {
    checkAccount();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAccount();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (appState === "loading") {
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
          LOADING FLIGHT PATH...
        </div>
      </main>
    );
  }

  if (appState === "signed-out") {
    return <FlightPathAuth onSignedIn={checkAccount} />;
  }

  if (appState === "needs-player") {
    return (
      <FlightPathPlayerSetup
        onPlayerCreated={(createdPlayerId) => {
          setPlayerId(createdPlayerId);
          setAppState("has-player");
        }}
      />
    );
  }

  if (appState === "has-player" && playerId) {
    return (
      <FlightPathPlayerHome
        playerId={playerId}
        onStartGame={() => setAppState("tracking-game")}
      />
    );
  }

  if (appState === "tracking-game" && playerId) {
    return (
      <GameTracker
        playerId={playerId}
        onGameSaved={() => setAppState("has-player")}
        onExitGame={() => setAppState("has-player")}
      />
    );
  }

  return null;
}
