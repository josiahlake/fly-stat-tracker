"use client";

import { useEffect, useState } from "react";

import FlightPathAuth from "./FlightPathAuth";
import FlightPathPlayerSetup from "./FlightPathPlayerSetup";
import FlightPathPlayerHome from "./FlightPathPlayerHome";
import FlightPathPostgameRecap from "./FlightPathPostgameRecap";
import FlightPathLog from "./FlightPathLog";
import FlightPathJourney from "./FlightPathJourney";
import FlightPathPlayerProfile from "./FlightPathPlayerProfile";
import GameTracker from "./GameTracker";

import { supabase } from "../lib/supabase";

type AppState =
  | "loading"
  | "signed-out"
  | "needs-player"
  | "has-player"
  | "tracking-game"
  | "postgame"
  | "flight-log"
  | "flight-path"
  | "player-profile";

export default function FlightPathApp() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [completedGameId, setCompletedGameId] = useState<string | null>(null);

  async function checkAccount() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setPlayerId(null);
      setCompletedGameId(null);
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

    if (access?.length) {
      setPlayerId(access[0].player_id);
      setAppState("has-player");
    } else {
      setPlayerId(null);
      setAppState("needs-player");
    }
  }

  async function openLatestCompletedGame() {
    if (!playerId) {
      setAppState("has-player");
      return;
    }

    const { data: latestGame, error } = await supabase
      .from("flight_games")
      .select("id")
      .eq("player_id", playerId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Could not load completed game:", error);
      setAppState("has-player");
      return;
    }

    if (latestGame?.id) {
      setCompletedGameId(latestGame.id);
      setAppState("postgame");
    } else {
      setAppState("has-player");
    }
  }

  useEffect(() => {
    checkAccount();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAccount();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (appState === "loading") {
    return (
      <main style={{
        minHeight:"100vh",background:"#050505",color:"#fff",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"Arial, Helvetica, sans-serif"
      }}>
        <div style={{fontSize:"11px",letterSpacing:"0.24em",color:"#777",fontWeight:800}}>
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
        onOpenLog={() => setAppState("flight-log")}
        onOpenPath={() => setAppState("flight-path")}
        onOpenPlayer={() => setAppState("player-profile")}
      />
    );
  }

  if (appState === "flight-log" && playerId) {
    return (
      <FlightPathLog
        playerId={playerId}
        onHome={() => setAppState("has-player")}
        onTrackGame={() => setAppState("tracking-game")}
        onOpenPath={() => setAppState("flight-path")}
        onOpenPlayer={() => setAppState("player-profile")}
        onOpenGame={(gameId) => {
          setCompletedGameId(gameId);
          setAppState("postgame");
        }}
      />
    );
  }

  if (appState === "flight-path" && playerId) {
    return (
      <FlightPathJourney
        playerId={playerId}
        onHome={() => setAppState("has-player")}
        onOpenLog={() => setAppState("flight-log")}
        onTrackGame={() => setAppState("tracking-game")}
        onOpenPlayer={() => setAppState("player-profile")}
      />
    );
  }

  if (appState === "player-profile" && playerId) {
    return (
      <FlightPathPlayerProfile
        playerId={playerId}
        onHome={() => setAppState("has-player")}
        onOpenLog={() => setAppState("flight-log")}
        onTrackGame={() => setAppState("tracking-game")}
        onOpenPath={() => setAppState("flight-path")}
      />
    );
  }

  if (appState === "tracking-game" && playerId) {
    return (
      <GameTracker
        playerId={playerId}
        onExitGame={() => setAppState("has-player")}
        onGameSaved={openLatestCompletedGame}
      />
    );
  }

  if (appState === "postgame" && playerId && completedGameId) {
    return (
      <FlightPathPostgameRecap
        playerId={playerId}
        gameId={completedGameId}
        onHome={() => {
          setCompletedGameId(null);
          setAppState("has-player");
        }}
      />
    );
  }

  return null;
}
