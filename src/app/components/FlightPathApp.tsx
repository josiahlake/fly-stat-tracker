"use client";

import { useEffect, useState } from "react";
import FlightPathAuth from "./FlightPathAuth";
import FlightPathPlayerSetup from "./FlightPathPlayerSetup";
import { supabase } from "../lib/supabase";

type AppState = "loading" | "signed-out" | "needs-player" | "has-player";

export default function FlightPathApp() {
  const [appState, setAppState] = useState<AppState>("loading");

  async function checkAccount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAppState("signed-out");
      return;
    }

    const { data: access, error } = await supabase
      .from("flight_player_access")
      .select("player_id")
      .eq("user_id", user.id)
      .limit(1);

    if (error) {
      console.error(error);
      setAppState("needs-player");
      return;
    }

    setAppState(access && access.length > 0 ? "has-player" : "needs-player");
  }

  useEffect(() => {
    checkAccount();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAccount();
    });

    return () => subscription.unsubscribe();
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
        onPlayerCreated={() => setAppState("has-player")}
      />
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "30px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "11px",
            letterSpacing: "0.24em",
            color: "#777777",
            fontWeight: 800,
            marginBottom: "12px",
          }}
        >
          FLIGHT PATH
        </div>

        <h1 style={{ margin: "0 0 10px", fontSize: "32px" }}>
          Player connected.
        </h1>

        <p style={{ color: "#999999", margin: 0 }}>
          Your player's Flight Path is ready.
        </p>
      </div>
    </main>
  );
}
