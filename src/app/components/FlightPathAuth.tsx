"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

type Props = {
  onSignedIn?: () => void;
};

export default function FlightPathAuth({ onSignedIn }: Props) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: "https://flightpath.theflyacademy.org",
          },
        });

        if (signUpError) throw signUpError;

        setMessage(
          "Account created. Check your email to verify your account, then return to Flight Path."
        );
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

setMessage("You're signed in.");
onSignedIn?.();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
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
        padding: "32px 20px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "420px",
        }}
      >
        <div
          style={{
            marginBottom: "42px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.28em",
              color: "#929292",
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            THE FLY ACADEMY
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "42px",
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
            }}
          >
            Flight Path
          </h1>

          <p
            style={{
              margin: "14px 0 0",
              color: "#b5b5b5",
              fontSize: "15px",
              lineHeight: 1.5,
            }}
          >
            Track your game. See your journey.
          </p>
        </div>

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: "22px",
            padding: "26px",
            background: "#0d0d0d",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
              padding: "5px",
              background: "#171717",
              borderRadius: "12px",
              marginBottom: "28px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setMessage("");
                setError("");
              }}
              style={{
                border: "none",
                borderRadius: "9px",
                padding: "11px 8px",
                cursor: "pointer",
                fontWeight: 800,
                background: mode === "signin" ? "#ffffff" : "transparent",
                color: mode === "signin" ? "#000000" : "#8d8d8d",
              }}
            >
              SIGN IN
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage("");
                setError("");
              }}
              style={{
                border: "none",
                borderRadius: "9px",
                padding: "11px 8px",
                cursor: "pointer",
                fontWeight: 800,
                background: mode === "signup" ? "#ffffff" : "transparent",
                color: mode === "signup" ? "#000000" : "#8d8d8d",
              }}
            >
              CREATE ACCOUNT
            </button>
          </div>

          <h2
            style={{
              margin: "0 0 6px",
              fontSize: "22px",
              fontWeight: 800,
            }}
          >
            {mode === "signin" ? "Welcome back." : "Start your Flight Path."}
          </h2>

          <p
            style={{
              margin: "0 0 24px",
              color: "#909090",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            {mode === "signin"
              ? "Sign in to continue your player's journey."
              : "Create your account and track your first 2 games free."}
          </p>

          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "#aaaaaa",
                marginBottom: "7px",
              }}
            >
              EMAIL
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@email.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #343434",
                background: "#111111",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "15px 14px",
                fontSize: "16px",
                outline: "none",
                marginBottom: "18px",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "#aaaaaa",
                marginBottom: "7px",
              }}
            >
              PASSWORD
            </label>

            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              placeholder="••••••••"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #343434",
                background: "#111111",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "15px 14px",
                fontSize: "16px",
                outline: "none",
                marginBottom: "18px",
              }}
            />

            {error && (
              <div
                style={{
                  background: "#3a1010",
                  border: "1px solid #7d1d1d",
                  color: "#ffb3b3",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "18px",
                  fontSize: "13px",
                  lineHeight: 1.45,
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  background: "#102817",
                  border: "1px solid #235b32",
                  color: "#b9f7c7",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "18px",
                  fontSize: "13px",
                  lineHeight: 1.45,
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                border: "none",
                borderRadius: "12px",
                padding: "16px",
                background: "#ffffff",
                color: "#000000",
                fontSize: "14px",
                fontWeight: 900,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.65 : 1,
              }}
            >
              {loading
                ? "PLEASE WAIT..."
                : mode === "signin"
                  ? "SIGN IN"
                  : "CREATE MY ACCOUNT"}
            </button>
          </form>
        </div>

        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
            color: "#666666",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          PRIVATE BY DEFAULT. SHARED BY CHOICE.
        </div>
      </section>
    </main>
  );
}
