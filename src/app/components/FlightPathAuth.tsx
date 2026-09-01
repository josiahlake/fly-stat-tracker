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
  const [showPassword, setShowPassword] = useState(false);
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

  const isSignIn = mode === "signin";

  return (
    <main className="authPage">
      <section className="authShell">

        {/* BRAND */}
        <header className="brandBlock">
          <div className="academyLabel">THE FLY ACADEMY</div>

          <div className="brandRow">
            <h1>FLIGHT PATH</h1>
            <span className="planeMark">➤</span>
          </div>

          <div className="tagline">
            TRACK <span>YOUR</span> GAME. SEE <span>YOUR</span> JOURNEY.
          </div>
        </header>

        {/* LEVEL JOURNEY */}
        <section className="journey">
          <div className="journeyStep elevate">
            <div className="journeyIcon">⌃</div>
            <strong>ELEVATE</strong>
          </div>

          <div className="arrow">→</div>

          <div className="journeyStep ascend">
            <div className="journeyIcon">⌃</div>
            <strong>ASCEND</strong>
          </div>

          <div className="arrow">→</div>

          <div className="journeyStep air">
            <div className="journeyIcon airIcon">➤</div>
            <strong>AIR</strong>
          </div>

          <div className="arrow">→</div>

          <div className="journeyStep select">
            <div className="journeyIcon starIcon">☆</div>
            <strong>SELECT</strong>
          </div>
        </section>

        {/* INTRO */}
        <section className="intro">
          <div className="eyebrow">
            {isSignIn ? "WELCOME BACK" : "WELCOME TO FLIGHT PATH"}
          </div>

          <h2>
            {isSignIn
              ? "Your player's journey continues."
              : "Start tracking the journey."}
          </h2>

          <p>
            {isSignIn
              ? "Sign in to track games, review progress and see how your player develops over time."
              : "Create your family account and start building your player's Flight Path."}
          </p>
        </section>

        {/* AUTH */}
        <section className="authCard">
          <div className="modeTabs">
            <button
              type="button"
              className={isSignIn ? "active" : ""}
              onClick={() => {
                setMode("signin");
                setMessage("");
                setError("");
              }}
            >
              SIGN IN
            </button>

            <button
              type="button"
              className={!isSignIn ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setMessage("");
                setError("");
              }}
            >
              CREATE ACCOUNT
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>EMAIL</span>

              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@email.com"
              />
            </label>

            <label className="field">
              <span>PASSWORD</span>

              <div className="passwordField">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    isSignIn ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                />

                <button
                  type="button"
                  className="showPassword"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </label>

            {error && (
              <div className="message errorMessage">
                {error}
              </div>
            )}

            {message && (
              <div className="message successMessage">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="primaryButton"
            >
              {loading ? (
                "PLEASE WAIT..."
              ) : (
                <>
                  {isSignIn
                    ? "ENTER FLIGHT PATH"
                    : "CREATE MY ACCOUNT"}
                  <span>→</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* TRUST */}
        <section className="trustSection">
          <div className="trustItem">
            <div className="trustIcon">◇</div>

            <div>
              <strong>YOUR DATA</strong>
              <span>Private by default.</span>
            </div>
          </div>

          <div className="trustItem">
            <div className="trustIcon">☁</div>

            <div>
              <strong>SAVED IN THE CLOUD</strong>
              <span>Your journey stays with you.</span>
            </div>
          </div>

          <div className="trustItem">
            <div className="trustIcon">◎</div>

            <div>
              <strong>BUILT FOR FLY FAMILIES</strong>
              <span>Parents track. Players grow.</span>
            </div>
          </div>
        </section>

        <footer>
          <strong>THE FLY ACADEMY</strong>
          <span>PREPARE FOR TAKEOFF.</span>
        </footer>
      </section>

      <style>{`
        :root {
          --black: #000000;
          --panel: #0b0b0d;
          --white: #ffffff;
          --muted: #9a9aa0;
          --line: #29292f;

          --purple: #7024ad;
          --purpleBright: #a54df2;
          --gold: #d49a19;
          --cyan: #00b5c9;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          background: #000;
        }

        button,
        input {
          font: inherit;
        }

        .authPage {
          min-height: 100vh;

          display: flex;
          justify-content: center;

          padding:
            max(30px, env(safe-area-inset-top))
            20px
            max(28px, env(safe-area-inset-bottom));

          background:
            radial-gradient(
              circle at 50% -10%,
              #191919 0%,
              #070707 33%,
              #000 65%
            );

          color: white;

          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }

        .authShell {
          width: 100%;
          max-width: 430px;
        }

        /* BRAND */

        .brandBlock {
          text-align: center;
          padding-top: 8px;
        }

        .academyLabel {
          color: #929298;

          font-size: 11px;
          font-weight: 800;

          letter-spacing: .27em;

          margin-bottom: 11px;
        }

        .brandRow {
          display: flex;
          justify-content: center;
          align-items: center;

          gap: 10px;
        }

        .brandRow h1 {
          margin: 0;

          color: white;

          font-size: 40px;
          line-height: .95;

          font-weight: 1000;
          font-style: italic;

          letter-spacing: -.055em;
        }

        .planeMark {
          display: inline-block;

          color: var(--gold);

          font-size: 29px;

          transform: rotate(-26deg);
        }

        .tagline {
          margin-top: 13px;

          color: #e5e5e7;

          font-size: 12px;
          font-weight: 900;

          letter-spacing: .13em;
        }

        .tagline span {
          color: var(--gold);
        }

        /* JOURNEY */

        .journey {
          display: grid;

          grid-template-columns:
            1fr
            20px
            1fr
            20px
            1fr
            20px
            1fr;

          align-items: center;

          margin-top: 30px;

          padding:
            18px
            2px;

          border-top:
            1px solid #26262a;

          border-bottom:
            1px solid #202024;
        }

        .journeyStep {
          display: flex;
          flex-direction: column;
          align-items: center;

          gap: 7px;
        }

        .journeyIcon {
          height: 31px;

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 30px;
          line-height: 1;

          font-weight: 900;
        }

        .journeyStep strong {
          font-size: 10px;
          font-weight: 1000;

          letter-spacing: .055em;
        }

        .arrow {
          color: #5f5f65;

          text-align: center;

          font-size: 16px;
        }

        .elevate {
          color: var(--gold);
        }

        .ascend {
          color: var(--purpleBright);
        }

        .air {
          color: var(--cyan);
        }

        .select {
          color: white;
        }

        .airIcon {
          transform: rotate(-25deg);
        }

        .starIcon {
          font-size: 34px;
        }

        /* INTRO */

        .intro {
          padding:
            31px
            4px
            22px;
        }

        .eyebrow {
          color: var(--purpleBright);

          font-size: 11px;
          font-weight: 900;

          letter-spacing: .18em;

          margin-bottom: 10px;
        }

        .intro h2 {
          margin: 0;

          color: #ffffff;

          font-size: 30px;
          line-height: 1.08;

          font-weight: 950;

          letter-spacing: -.025em;
        }

        .intro p {
          margin:
            12px
            0
            0;

          color: #a7a7ad;

          font-size: 14px;
          line-height: 1.55;
        }

        /* AUTH CARD */

        .authCard {
          padding: 11px;

          border:
            1px solid
            #303036;

          border-radius: 18px;

          background:
            linear-gradient(
              180deg,
              #101012,
              #080809
            );

          box-shadow:
            0
            20px
            50px
            rgba(0,0,0,.45);
        }

        .modeTabs {
          display: grid;
          grid-template-columns: 1fr 1fr;

          gap: 5px;

          padding: 4px;

          margin-bottom: 20px;

          background: #050506;

          border:
            1px solid
            #1f1f23;

          border-radius: 11px;
        }

        .modeTabs button {
          min-height: 47px;

          border: none;
          border-radius: 8px;

          background: transparent;

          color: #77777d;

          font-size: 12px;
          font-weight: 900;

          letter-spacing: .06em;

          cursor: pointer;
        }

        .modeTabs button.active {
          color: white;

          background:
            linear-gradient(
              180deg,
              #202023,
              #151517
            );

          box-shadow:
            inset
            0
            0
            0
            1px
            rgba(255,255,255,.08);
        }

        form {
          padding:
            0
            5px
            5px;
        }

        .field {
          display: block;

          margin-bottom: 16px;
        }

        .field > span {
          display: block;

          margin:
            0
            0
            8px
            2px;

          color: #a5a5aa;

          font-size: 11px;
          font-weight: 900;

          letter-spacing: .14em;
        }

        .field input {
          width: 100%;
          height: 54px;

          border:
            1px solid
            #36363b;

          border-radius: 10px;

          outline: none;

          background: #0c0c0e;

          color: white;

          padding:
            0
            15px;

          font-size: 16px;
        }

        .field input::placeholder {
          color: #64646a;
        }

        .field input:focus {
          border-color: #8d3ed2;

          box-shadow:
            0
            0
            0
            3px
            rgba(141,62,210,.13);
        }

        .passwordField {
          position: relative;
        }

        .passwordField input {
          padding-right: 70px;
        }

        .showPassword {
          position: absolute;

          top: 0;
          right: 5px;

          height: 54px;

          padding:
            0
            11px;

          border: none;

          background: transparent;

          color: #a5a5aa;

          font-size: 10px;
          font-weight: 900;

          letter-spacing: .07em;

          cursor: pointer;
        }

        .message {
          margin-bottom: 16px;

          padding: 12px;

          border-radius: 9px;

          font-size: 13px;
          line-height: 1.45;
        }

        .errorMessage {
          background: #351010;

          border:
            1px solid
            #762020;

          color: #ffb5b5;
        }

        .successMessage {
          background: #102817;

          border:
            1px solid
            #235b32;

          color: #b9f7c7;
        }

        .primaryButton {
          width: 100%;
          min-height: 58px;

          border:
            1px solid
            #9846e5;

          border-radius: 10px;

          display: flex;
          justify-content: center;
          align-items: center;

          gap: 11px;

          background:
            linear-gradient(
              110deg,
              #34105e,
              #7024ad 52%,
              #42116f
            );

          color: white;

          font-size: 13px;
          font-weight: 950;

          letter-spacing: .075em;

          cursor: pointer;
        }

        .primaryButton span {
          font-size: 20px;
          font-weight: 400;
        }

        .primaryButton:active {
          transform: scale(.985);
          filter: brightness(1.18);
        }

        .primaryButton:disabled {
          opacity: .65;
          cursor: default;
        }

        /* TRUST */

        .trustSection {
          display: grid;
          grid-template-columns: 1fr;

          gap: 13px;

          margin-top: 25px;

          padding-top: 21px;

          border-top:
            1px solid
            #252529;
        }

        .trustItem {
          display: flex;
          align-items: center;

          gap: 12px;

          padding:
            0
            4px;
        }

        .trustIcon {
          width
