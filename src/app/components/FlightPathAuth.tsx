"use client";
import FlightLevelMark from "./FlightLevelMark";
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

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setError("");
  }

  return (
    <main className="AuthPage">
      <section className="AuthShell">
        <header className="fpBrand">
          <div className="fpAcademy">THE FLY ACADEMY</div>

          <div className="fpBrandRow">
            <div className="fpWordmark">FLIGHT PATH</div>
            <div className="fpPlane">➤</div>
          </div>

          <div className="fpTagline">
            TRACK <span>YOUR</span> GAME. SEE <span>YOUR</span> JOURNEY.
          </div>
        </header>
<section className="fpJourney">
  <FlightLevelMark
    level="elevate"
    showName
    size="md"
  />

  <div className="fpArrow">→</div>

  <FlightLevelMark
    level="ascend"
    showName
    size="md"
  />

  <div className="fpArrow">→</div>

  <FlightLevelMark
    level="air"
    showName
    size="md"
  />

  <div className="fpArrow">→</div>

  <FlightLevelMark
    level="select"
    showName
    size="md"
  />
</section>

        <section className="fpIntro">
          <div className="fpEyebrow">
            {isSignIn ? "WELCOME BACK" : "WELCOME TO FLIGHT PATH"}
          </div>

          <h1>
            {isSignIn
              ? "Your player's journey continues."
              : "Start tracking the journey."}
          </h1>

          <p>
            {isSignIn
              ? "Sign in to track games, review progress and see how your player develops over time."
              : "Create your family account and start building your player's Flight Path."}
          </p>
        </section>

        <section className="fpCard">
          <div className="fpTabs">
            <button
              type="button"
              className={isSignIn ? "active" : ""}
              onClick={() => switchMode("signin")}
            >
              SIGN IN
            </button>

            <button
              type="button"
              className={!isSignIn ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              CREATE ACCOUNT
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="fpField">
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

            <label className="fpField">
              <span>PASSWORD</span>

              <div className="fpPasswordWrap">
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
                  className="fpShowPassword"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </label>

            {error ? (
              <div className="fpMessage fpError">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="fpMessage fpSuccess">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="fpPrimary"
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

        <section className="fpTrust">
          <div className="fpTrustItem">
            <div className="fpTrustIcon">◇</div>

            <div>
              <strong>YOUR DATA</strong>
              <span>Private by default.</span>
            </div>
          </div>

          <div className="fpTrustItem">
            <div className="fpTrustIcon">☁</div>

            <div>
              <strong>SAVED IN THE CLOUD</strong>
              <span>Your journey stays with you.</span>
            </div>
          </div>

          <div className="fpTrustItem">
            <div className="fpTrustIcon">◎</div>

            <div>
              <strong>BUILT FOR FLY FAMILIES</strong>
              <span>Parents track. Players grow.</span>
            </div>
          </div>
        </section>

        <footer className="fpFooter">
          <strong>THE FLY ACADEMY</strong>
          <span>PREPARE FOR TAKEOFF.</span>
        </footer>
      </section>

      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          background: #000000;
        }

        button,
        input {
          font: inherit;
        }

        .fpAuthPage {
          min-height: 100vh;
          width: 100%;
          display: flex;
          justify-content: center;
          background:
            radial-gradient(
              circle at 50% -8%,
              #181818 0%,
              #080808 34%,
              #000000 67%
            );
          color: #ffffff;
          padding:
            max(28px, env(safe-area-inset-top))
            18px
            max(28px, env(safe-area-inset-bottom));
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }
.fpAuthShell {
  width: 100%;
  max-width: 430px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

        .fpBrand {
          text-align: center;
          padding-top: 8px;
        }

        .fpAcademy {
          color: #a0a0a5;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.24em;
          margin-bottom: 10px;
        }

        .fpBrandRow {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
        }

        .fpWordmark {
          color: #ffffff;
          font-size: clamp(36px, 10vw, 44px);
          line-height: 0.95;
          font-weight: 1000;
          font-style: italic;
          letter-spacing: -0.055em;
        }

        .fpPlane {
          color: #d59b21;
          font-size: 30px;
          line-height: 1;
          transform: rotate(-26deg);
        }

        .fpTagline {
          margin-top: 14px;
          color: #eeeeef;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .fpTagline span {
          color: #d59b21;
        }
.fpJourney {
  width: 100%;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) 18px
    minmax(0, 1fr) 18px
    minmax(0, 1fr) 18px
    minmax(0, 1fr);
  align-items: center;
  margin-top: 30px;
  padding: 19px 2px 18px;
  border-top: 1px solid #28282c;
  border-bottom: 1px solid #232327;
}

        .fpLevel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-width: 0;
        }

        .fpLevelIcon {
          min-height: 33px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
        }

        .fpLevel strong {
          font-size: 11px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: 0.035em;
        }

        .fpElevate {
          color: #d59b21;
        }

        .fpAscend {
          color: #a84df5;
        }

        .fpAir {
          color: #00b8cc;
        }

        .fpSelect {
          color: #ffffff;
        }

        .fpAirIcon {
          transform: rotate(-25deg);
        }

        .fpStar {
          font-size: 35px;
        }

        .fpArrow {
          color: #66666c;
          text-align: center;
          font-size: 17px;
        }

        .fpIntro {
          padding: 31px 4px 23px;
        }

        .fpEyebrow {
          color: #a84df5;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.17em;
          margin-bottom: 10px;
        }

        .fpIntro h1 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(29px, 7.5vw, 34px);
          line-height: 1.08;
          font-weight: 950;
          letter-spacing: -0.025em;
        }

        .fpIntro p {
          margin: 12px 0 0;
          color: #b0b0b5;
          font-size: 14px;
          line-height: 1.55;
        }

        .fpCard {
          padding: 11px;
          border: 1px solid #303036;
          border-radius: 18px;
          background:
            linear-gradient(
              180deg,
              #101012,
              #080809
            );
          box-shadow:
            0 20px 50px
            rgba(0, 0, 0, 0.45);
        }

        .fpTabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
          padding: 4px;
          margin-bottom: 20px;
          background: #050506;
          border: 1px solid #202024;
          border-radius: 11px;
        }

        .fpTabs button {
          min-height: 48px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #7d7d83;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.055em;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .fpTabs button.active {
          color: #ffffff;
          background:
            linear-gradient(
              180deg,
              #222225,
              #151517
            );
          box-shadow:
            inset 0 0 0 1px
            rgba(255, 255, 255, 0.08);
        }

        .fpField {
          display: block;
          margin-bottom: 16px;
        }

        .fpField > span {
          display: block;
          margin: 0 0 8px 2px;
          color: #b2b2b7;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.13em;
        }

        .fpField input {
          width: 100%;
          height: 55px;
          display: block;
          border: 1px solid #37373c;
          border-radius: 10px;
          outline: none;
          background: #0c0c0e;
          color: #ffffff;
          padding: 0 15px;
          font-size: 16px;
        }

        .fpField input::placeholder {
          color: #67676c;
        }

        .fpField input:focus {
          border-color: #8e3cd4;
          box-shadow:
            0 0 0 3px
            rgba(142, 60, 212, 0.14);
        }

        .fpPasswordWrap {
          position: relative;
        }

        .fpPasswordWrap input {
          padding-right: 74px;
        }

        .fpShowPassword {
          position: absolute;
          top: 0;
          right: 5px;
          height: 55px;
          padding: 0 11px;
          border: none;
          background: transparent;
          color: #b0b0b5;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.07em;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .fpMessage {
          margin-bottom: 16px;
          padding: 12px;
          border-radius: 9px;
          font-size: 13px;
          line-height: 1.45;
        }

        .fpError {
          background: #341010;
          border: 1px solid #742020;
          color: #ffb6b6;
        }

        .fpSuccess {
          background: #102817;
          border: 1px solid #235b32;
          color: #b9f7c7;
        }

        .fpPrimary {
          width: 100%;
          min-height: 59px;
          border: 1px solid #9b48e8;
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
          color: #ffffff;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 0.07em;
          cursor: pointer;
          box-shadow:
            inset 0 0 18px
            rgba(255, 255, 255, 0.04),
            0 0 22px
            rgba(112, 36, 173, 0.13);
          -webkit-tap-highlight-color: transparent;
        }

        .fpPrimary span {
          font-size: 20px;
          font-weight: 400;
        }

        .fpPrimary:active {
          transform: scale(0.985);
          filter: brightness(1.18);
        }

        .fpPrimary:disabled {
          opacity: 0.65;
          cursor: default;
        }

        .fpTrust {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          margin-top: 25px;
          padding: 21px 4px 0;
          border-top: 1px solid #27272b;
        }

        .fpTrustItem {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .fpTrustIcon {
          flex: 0 0 auto;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #59267d;
          border-radius: 9px;
          color: #ad55f4;
          font-size: 20px;
          background: #09090a;
        }

        .fpTrustItem > div:last-child {
          display: flex;
          flex-direction: column;
        }

        .fpTrustItem strong {
          color: #f1f1f2;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.07em;
        }

        .fpTrustItem span {
          margin-top: 3px;
          color: #8f8f95;
          font-size: 12px;
          line-height: 1.35;
        }

        .fpFooter {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          padding-top: 28px;
        }

        .fpFooter strong {
          color: #c8c8cc;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.19em;
        }

        .fpFooter span {
          color: #707076;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.14em;
        }

        @media (max-width: 380px) {
          .fpAuthPage {
            padding-left: 14px;
            padding-right: 14px;
          }

          .fpWordmark {
            font-size: 35px;
          }

          .fpPlane {
            font-size: 26px;
          }

          .fpTagline {
            font-size: 11px;
            letter-spacing: 0.075em;
          }

          .fpJourney {
            grid-template-columns:
              1fr 14px
              1fr 14px
              1fr 14px
              1fr;
          }

          .fpLevel strong {
            font-size: 10px;
          }

          .fpIntro h1 {
            font-size: 28px;
          }
        }
      `}</style>
    </main>
  );
}
