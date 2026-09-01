import FlightLevelMark from "./FlightLevelMark";
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  gameId: string;
  playerId: string;
  onHome: () => void;
};

type RecapData = {
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;

  opponentName: string;
  gameDate: string;

  flyScore: number | null;
  opponentScore: number | null;
  result: string | null;

  twoMade: number;
  twoMissed: number;
  threeMade: number;
  threeMissed: number;
  ftMade: number;
  ftMissed: number;

  rebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  blocks: number;
  fouls: number;

  playingSeconds: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;

  return `${minutes}:${pad2(secs)}`;
}

function pct(made: number, attempts: number) {
  if (!attempts) return 0;
  return Math.round((made / attempts) * 100);
}

export default function FlightPathPostgameRecap({
  gameId,
  playerId,
  onHome,
}: Props) {
  const [data, setData] =
    useState<RecapData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRecap() {
      setLoading(true);
      setError("");

      try {
        const { data: player, error: playerError } =
          await supabase
            .from("flight_players")
            .select("first_name, last_name")
            .eq("id", playerId)
            .single();

        if (playerError) throw playerError;

        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from("flight_team_memberships")
          .select("jersey_number")
          .eq("player_id", playerId)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          throw membershipError;
        }

        const { data: game, error: gameError } =
          await supabase
            .from("flight_games")
            .select(`
              id,
              game_date,
              opponent_name,
              fly_score,
              opponent_score,
              result
            `)
            .eq("id", gameId)
            .single();

        if (gameError) throw gameError;

        const { data: stats, error: statsError } =
          await supabase
            .from("flight_game_stats")
            .select(`
              two_pt_made,
              two_pt_missed,
              three_pt_made,
              three_pt_missed,
              ft_made,
              ft_missed,
              rebounds,
              assists,
              steals,
              turnovers,
              blocks,
              fouls,
              playing_seconds
            `)
            .eq("game_id", gameId)
            .single();

        if (statsError) throw statsError;

        if (cancelled) return;

        setData({
          firstName:
            player.first_name ?? "",

          lastName:
            player.last_name ?? "",

          jerseyNumber:
            membership?.jersey_number ?? null,

          opponentName:
            game.opponent_name || "Opponent",

          gameDate:
            game.game_date || "",

          flyScore:
            game.fly_score ?? null,

          opponentScore:
            game.opponent_score ?? null,

          result:
            game.result ?? null,

          twoMade:
            stats.two_pt_made ?? 0,

          twoMissed:
            stats.two_pt_missed ?? 0,

          threeMade:
            stats.three_pt_made ?? 0,

          threeMissed:
            stats.three_pt_missed ?? 0,

          ftMade:
            stats.ft_made ?? 0,

          ftMissed:
            stats.ft_missed ?? 0,

          rebounds:
            stats.rebounds ?? 0,

          assists:
            stats.assists ?? 0,

          steals:
            stats.steals ?? 0,

          turnovers:
            stats.turnovers ?? 0,

          blocks:
            stats.blocks ?? 0,

          fouls:
            stats.fouls ?? 0,

          playingSeconds:
            stats.playing_seconds ?? 0,
        });
      } catch (err) {
        console.error(
          "Unable to load postgame recap:",
          err
        );

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load game recap."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRecap();

    return () => {
      cancelled = true;
    };
  }, [gameId, playerId]);

  const derived = useMemo(() => {
    if (!data) return null;

    const fgm =
      data.twoMade +
      data.threeMade;

    const fga =
      data.twoMade +
      data.twoMissed +
      data.threeMade +
      data.threeMissed;

    const threeAttempts =
      data.threeMade +
      data.threeMissed;

    const ftAttempts =
      data.ftMade +
      data.ftMissed;

    const points =
      data.twoMade * 2 +
      data.threeMade * 3 +
      data.ftMade;

    return {
      points,
      fgm,
      fga,
      fgPct: pct(fgm, fga),

      twoAttempts:
        data.twoMade +
        data.twoMissed,

      twoPct: pct(
        data.twoMade,
        data.twoMade +
          data.twoMissed
      ),

      threeAttempts,
      threePct: pct(
        data.threeMade,
        threeAttempts
      ),

      ftAttempts,
      ftPct: pct(
        data.ftMade,
        ftAttempts
      ),
    };
  }, [data]);

  async function shareGame() {
  if (!data || !derived) return;

  const playerName =
    `${data.firstName} ${data.lastName}`.trim();

  const score =
    data.flyScore !== null &&
    data.opponentScore !== null
      ? `${data.result ?? ""} ${data.flyScore}-${data.opponentScore}`
      : "";

  const text =
    `FLIGHT PATH\n\n` +
    `${playerName}` +
    `${data.jerseyNumber ? ` #${data.jerseyNumber}` : ""}\n` +
    `vs. ${data.opponentName}\n` +
    `${score}\n\n` +
    `${derived.points} PTS · ` +
    `${data.rebounds} REB · ` +
    `${data.assists} AST · ` +
    `${data.steals} STL\n\n` +
    `2PT ${data.twoMade}-${derived.twoAttempts} · ` +
    `3PT ${data.threeMade}-${derived.threeAttempts} · ` +
    `FT ${data.ftMade}-${derived.ftAttempts}\n` +
    `Playing Time ${formatClock(data.playingSeconds)}`;

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({
        title: `${playerName} · Flight Path`,
        text,
      });

      return;
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);

      alert(
        "Game summary copied. You can paste it into a text or email."
      );

      return;
    }

    alert(
      "Sharing is not available in this browser yet."
    );
  } catch (error) {
    console.error(
      "Share cancelled or unavailable:",
      error
    );
  }
}

  if (loading) {
    return (
      <main className="statePage">
        LOADING POSTGAME RECAP...
        <style>{stateCss}</style>
      </main>
    );
  }

  if (error || !data || !derived) {
    return (
      <main className="statePage">
        <strong>
          WE COULDN&apos;T LOAD THIS GAME.
        </strong>

        <button onClick={onHome}>
          RETURN HOME
        </button>

        <style>{stateCss}</style>
      </main>
    );
  }

  const playerName =
    `${data.firstName} ${data.lastName}`.trim();

  const scoreReady =
    data.flyScore !== null &&
    data.opponentScore !== null;

  return (
    <main className="page">
      <section className="app">

        {/* FLIGHT PATH BRAND */}

        <header className="brandHeader">
          <button
            type="button"
            className="back"
            onClick={onHome}
          >
            ‹
          </button>

          <div className="brand">
            <span className="brandMark">➤</span>
            FLIGHT PATH
          </div>

          <button
            type="button"
            className="menu"
          >
            •••
          </button>
        </header>

        {/* LEVEL SYSTEM */}

<section className="levels">
  <FlightLevelMark
    level="elevate"
    showName
    showDescriptor
    size="md"
  />

  <div className="levelArrow">→</div>

  <FlightLevelMark
    level="ascend"
    showName
    showDescriptor
    size="md"
  />

  <div className="levelArrow">→</div>

  <FlightLevelMark
    level="air"
    showName
    showDescriptor
    size="md"
  />

  <div className="levelArrow">→</div>

  <FlightLevelMark
    level="select"
    showName
    showDescriptor
    size="md"
  />
</section>

        {/* GAME COMPLETE */}

        <section className="completeHero">
          <div className="confetti">
            ✦ · ✧ · ✦
          </div>

          <div className="completeTitle">
            GAME COMPLETE
            <span>🏆</span>
          </div>
        </section>

        {/* PLAYER / RESULT */}

        <section className="playerCard">
          <div className="avatar">
            <div className="avatarInner">
              {data.firstName
                .charAt(0)
                .toUpperCase()}

              {data.lastName
                .charAt(0)
                .toUpperCase()}
            </div>
          </div>

          <div className="playerResult">
            <div className="playerName">
              {playerName}

              {data.jerseyNumber && (
                <span>
                  #{data.jerseyNumber}
                </span>
              )}
            </div>

            {scoreReady && (
              <div className="score">
                <strong
                  className={
                    data.result === "W"
                      ? "win"
                      : data.result === "L"
                      ? "loss"
                      : "tie"
                  }
                >
                  {data.result}
                </strong>

                <b>{data.flyScore}</b>

                <em>–</em>

                <b>{data.opponentScore}</b>
              </div>
            )}

            <div className="opponent">
              vs. {data.opponentName}
            </div>
          </div>
        </section>

        {/* HERO STATS */}

        <section className="heroStats">
          <HeroStat
            value={derived.points}
            label="PTS"
          />

          <HeroStat
            value={data.rebounds}
            label="REB"
          />

          <HeroStat
            value={data.assists}
            label="AST"
          />

          <HeroStat
            value={data.steals}
            label="STL"
          />
        </section>

        {/* PLAYING TIME */}

        <section className="timeCard">
          <div>
            <span className="clockIcon">
              ◷
            </span>

            <strong>
              PLAYING TIME
            </strong>
          </div>

          <b>
            {formatClock(
              data.playingSeconds
            )}
          </b>
        </section>

        {/* SHOOTING */}

        <section className="module">
          <div className="moduleTitle">
            SHOOTING
          </div>

          <div className="shootGrid">
            <ShootStat
              type="two"
              label="2PT"
              made={data.twoMade}
              attempts={
                derived.twoAttempts
              }
              percentage={
                derived.twoPct
              }
            />

            <ShootStat
              type="three"
              label="3PT"
              made={data.threeMade}
              attempts={
                derived.threeAttempts
              }
              percentage={
                derived.threePct
              }
            />

            <ShootStat
              type="ft"
              label="FT"
              made={data.ftMade}
              attempts={
                derived.ftAttempts
              }
              percentage={
                derived.ftPct
              }
            />

            <div className="shootStat">
              <span className="fgLabel">
                FG%
              </span>

              <strong>
                {derived.fgPct}%
              </strong>
            </div>
          </div>
        </section>

        {/* FLIGHT NOTES */}

        <section className="module">
          <div className="moduleTitle">
            FLIGHT NOTES
          </div>

          <div className="notesGrid">
            <FlightNote
              type="gold"
              icon="↗"
              title="SEASON HIGH"
              body="Keep building the standard."
            />

            <FlightNote
              type="purple"
              icon="⌁"
              title="TRENDING UP"
              body="Your Flight Path is taking shape."
            />

            <FlightNote
              type="cyan"
              icon="☆"
              title="MILESTONE"
              body="Another game added to the journey."
            />
          </div>
        </section>

        {/* ACTIONS */}

        <button
          type="button"
          className="shareButton"
          onClick={shareGame}
        >
          <span>⇧</span>
          SHARE GAME
        </button>

        <button
          type="button"
          className="pathButton"
          onClick={onHome}
        >
          <span>▥</span>
          VIEW FLIGHT PATH
        </button>

        <button
          type="button"
          className="editButton"
          onClick={() =>
            alert(
              "Edit Game is coming next. Your finalized game is safely saved."
            )
          }
        >
          ✎ EDIT GAME
        </button>

      </section>

      <style>{`
        :root {
          --gold: #e5a719;
          --purple: #8f36df;
          --cyan: #00bdd7;
          --green: #10d643;
          --red: #ff2424;

          --white: #ffffff;
          --muted: #99999f;
          --panel: #09090a;
          --line: #333338;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          background: #000;
        }

        button {
          font: inherit;
          -webkit-tap-highlight-color: transparent;
        }

        .page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 0% 32%,
              rgba(109, 30, 167, .15),
              transparent 25%
            ),
            radial-gradient(
              circle at 100% 32%,
              rgba(229, 167, 25, .12),
              transparent 25%
            ),
            #000;

          color: white;

          padding:
            max(
              14px,
              env(safe-area-inset-top)
            )
            14px
            calc(
              32px +
              env(safe-area-inset-bottom)
            );

          font-family:
            "Arial Narrow",
            "Helvetica Neue Condensed",
            Arial,
            sans-serif;
        }

        .app {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }

        .brandHeader {
          min-height: 58px;

          display: grid;
          grid-template-columns:
            46px 1fr 46px;

          align-items: center;
        }

        .back,
        .menu {
          height: 44px;
          border: 0;
          background: transparent;
          color: white;
          cursor: pointer;
        }

        .back {
          font-size: 44px;
          text-align: left;
          font-weight: 200;
        }

        .menu {
          font-size: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: center;

          gap: 7px;

          font-size: 25px;
          font-weight: 950;
          font-style: italic;
          letter-spacing: .04em;
        }

        .brandMark {
          color: var(--gold);
          display: inline-block;
          transform: rotate(-25deg);

          font-size: 21px;
        }

        /* LEVELS */

        .levels {
          display: grid;
          grid-template-columns:
            1fr 18px
            1fr 18px
            1fr 18px
            1fr;

          align-items: center;

          padding: 13px 0 17px;

          border-bottom:
            1px solid #222226;
        }

        .level {
          min-width: 0;
          text-align: center;
        }

        .level svg {
          width: 36px;
          height: 36px;
          margin-bottom: 4px;
        }

        .levelName {
          font-size: 12px;
          line-height: 1;

          font-weight: 950;
          white-space: nowrap;
        }

        .levelSub {
          margin-top: 6px;

          font-size: 7px;
          line-height: 1.15;

          color: white;

          font-weight: 800;
          letter-spacing: .07em;

          white-space: nowrap;
        }

        .level.elevate {
          color: var(--gold);
        }

        .level.ascend {
          color: var(--purple);
        }

        .level.air {
          color: var(--cyan);
        }

        .level.select {
          color: white;
        }

        .levelArrow {
          color: #69696e;
          font-size: 19px;
          text-align: center;
        }

        /* COMPLETE */

        .completeHero {
          padding: 32px 0 18px;

          position: relative;
          text-align: center;
        }

        .confetti {
          position: absolute;
          top: 10px;
          left: 0;
          right: 0;

          color: var(--purple);

          font-size: 22px;
          letter-spacing: .4em;

          opacity: .55;
        }

        .completeTitle {
          position: relative;

          font-size: clamp(
            34px,
            10vw,
            48px
          );

          line-height: .95;

          font-weight: 1000;
          letter-spacing: -.035em;

          text-shadow:
            0 2px 13px
            rgba(255,255,255,.08);
        }

        .completeTitle span {
          margin-left: 7px;
          font-size: .72em;
        }

        /* PLAYER */

        .playerCard {
          display: grid;
          grid-template-columns:
            120px 1fr;

          gap: 18px;
          align-items: center;

          border: 1px solid #414147;
          border-radius: 20px;

          background:
            linear-gradient(
              145deg,
              #101012,
              #050506
            );

          padding: 17px;

          margin-bottom: 12px;
        }

        .avatar {
          width: 116px;
          height: 116px;

          border-radius: 50%;

          padding: 3px;

          background:
            linear-gradient(
              145deg,
              var(--purple),
              #43146d,
              var(--gold)
            );
        }

        .avatarInner {
          width: 100%;
          height: 100%;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          background:
            radial-gradient(
              circle at 50% 30%,
              #313137,
              #0b0b0d 67%
            );

          color: white;

          font-size: 32px;
          font-weight: 950;
        }

        .playerName {
          color: white;

          font-size: clamp(
            21px,
            6vw,
            29px
          );

          line-height: 1;

          font-weight: 950;
          text-transform: uppercase;

          white-space: nowrap;
        }

        .playerName span {
          margin-left: 7px;

          color: var(--purple);
          font-size: .75em;
        }

        .score {
          display: flex;
          align-items: center;

          gap: 10px;

          margin-top: 13px;
        }

        .score strong {
          font-size: 38px;
          line-height: 1;
          font-weight: 950;
        }

        .score strong.win {
          color: var(--cyan);
        }

        .score strong.loss {
          color: var(--red);
        }

        .score strong.tie {
          color: var(--gold);
        }

        .score b {
          color: white;

          font-size: 42px;
          line-height: 1;

          font-weight: 950;
        }

        .score em {
          color: #74747a;

          font-size: 27px;
          font-style: normal;
        }

        .opponent {
          margin-top: 8px;

          color: #aaaaaf;

          font-size: 14px;
          font-weight: 900;

          text-transform: uppercase;
          letter-spacing: .05em;
        }

        /* HERO STATS */

        .heroStats {
          display: grid;
          grid-template-columns:
            repeat(4, 1fr);

          border: 1px solid #3b3b40;
          border-radius: 14px;

          overflow: hidden;

          background: #09090a;

          margin-bottom: 12px;
        }

        .heroStat {
          min-height: 94px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          border-right:
            1px solid #37373c;
        }

        .heroStat:last-child {
          border-right: 0;
        }

        .heroStat strong {
          font-size: 36px;
          line-height: .9;
          font-weight: 950;
        }

        .heroStat span {
          margin-top: 10px;

          color: var(--cyan);

          font-size: 12px;
          font-weight: 950;
          letter-spacing: .1em;
        }

        /* TIME */

        .timeCard {
          min-height: 74px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          padding: 0 18px;

          border: 1px solid #3a3a40;
          border-radius: 13px;

          background: #09090a;

          margin-bottom: 12px;
        }

        .timeCard > div {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .clockIcon {
          color: var(--cyan);
          font-size: 32px;
        }

        .timeCard strong {
          font-size: 15px;
          letter-spacing: .08em;
        }

        .timeCard b {
          font-size: 32px;
          font-weight: 900;
        }

        /* MODULE */

        .module {
          border: 1px solid #37373c;
          border-radius: 13px;

          padding: 12px;

          background:
            linear-gradient(
              180deg,
              #080809,
              #030303
            );

          margin-bottom: 12px;
        }

        .moduleTitle {
          color: white;

          font-size: 15px;
          font-weight: 950;
          letter-spacing: .07em;

          margin: 0 0 10px;
        }

        /* SHOOTING */

        .shootGrid {
          display: grid;
          grid-template-columns:
            repeat(4, 1fr);

          border: 1px solid #323237;
          border-radius: 10px;

          overflow: hidden;
        }

        .shootStat {
          min-height: 112px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          border-right:
            1px solid #3a3a3f;
        }

        .shootStat:last-child {
          border-right: 0;
        }

        .shootStat span {
          font-size: 15px;
          font-weight: 950;
        }

        .shootStat strong {
          margin-top: 10px;

          color: white;

          font-size: 28px;
          line-height: 1;

          font-weight: 950;
        }

        .shootStat small {
          margin-top: 8px;

          font-size: 16px;
          font-weight: 900;
        }

        .shootStat.two span,
        .shootStat.two small {
          color: var(--gold);
        }

        .shootStat.three span,
        .shootStat.three small {
          color: var(--purple);
        }

        .shootStat.ft span,
        .shootStat.ft small {
          color: var(--cyan);
        }

        .fgLabel {
          color: #d7d7da;
        }

        /* NOTES */

        .notesGrid {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);

          gap: 7px;
        }

        .flightNote {
          min-height: 142px;

          border: 1px solid #34343a;
          border-radius: 10px;

          background:
            linear-gradient(
              155deg,
              #121214,
              #070708
            );

          padding: 12px 7px;

          display: flex;
          flex-direction: column;
          align-items: center;

          text-align: center;
        }

        .noteIcon {
          font-size: 33px;
          line-height: 1;

          margin-bottom: 9px;
        }

        .flightNote strong {
          font-size: 13px;
          line-height: 1.1;
          font-weight: 950;
        }

        .flightNote p {
          margin: 8px 0 0;

          color: #d0d0d3;

          font-size: 10px;
          line-height: 1.35;
        }

        .flightNote.gold,
        .flightNote.gold .noteIcon {
          color: var(--gold);
        }

        .flightNote.purple,
        .flightNote.purple .noteIcon {
          color: var(--purple);
        }

        .flightNote.cyan,
        .flightNote.cyan .noteIcon {
          color: var(--cyan);
        }

        /* ACTIONS */

        .shareButton,
        .pathButton,
        .editButton {
          width: 100%;
          min-height: 58px;

          border-radius: 9px;

          display: flex;
          align-items: center;
          justify-content: center;

          gap: 12px;

          cursor: pointer;

          font-weight: 950;
          letter-spacing: .075em;
        }

        .shareButton {
          border: 1px solid #29d9ec;

          background:
            linear-gradient(
              110deg,
              #00a5c2,
              #13c8e2
            );

          color: white;

          font-size: 16px;

          margin-top: 15px;
        }

        .shareButton span {
          font-size: 23px;
        }

        .pathButton {
          margin-top: 8px;

          border:
            1.5px solid
            var(--purple);

          background: #030303;
          color: var(--purple);

          font-size: 15px;
        }

        .pathButton span {
          font-size: 19px;
        }

        .editButton {
          min-height: 49px;

          margin-top: 8px;

          border: 1px solid #45454a;

          background: #020202;

          color: #c1c1c5;

          font-size: 12px;
        }

        @media (max-width: 420px) {
          .page {
            padding-left: 8px;
            padding-right: 8px;
          }

          .brand {
            font-size: 22px;
          }

          .levels {
            grid-template-columns:
              1fr 12px
              1fr 12px
              1fr 12px
              1fr;
          }

          .level svg {
            width: 30px;
            height: 30px;
          }

          .levelName {
            font-size: 10px;
          }

          .levelSub {
            font-size: 6px;
          }

          .playerCard {
            grid-template-columns:
              93px 1fr;

            gap: 12px;

            padding: 13px;
          }

          .avatar {
            width: 90px;
            height: 90px;
          }

          .avatarInner {
            font-size: 25px;
          }

          .score b {
            font-size: 34px;
          }

          .score strong {
            font-size: 31px;
          }

          .heroStat {
            min-height: 82px;
          }

          .heroStat strong {
            font-size: 30px;
          }

          .shootStat {
            min-height: 99px;
          }

          .shootStat strong {
            font-size: 23px;
          }

          .notesGrid {
            gap: 5px;
          }

          .flightNote {
            min-height: 130px;
          }
        }
      `}</style>
    </main>
  );
}

function HeroStat({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="heroStat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ShootStat({
  type,
  label,
  made,
  attempts,
  percentage,
}: {
  type: string;
  label: string;
  made: number;
  attempts: number;
  percentage: number;
}) {
  return (
    <div className={`shootStat ${type}`}>
      <span>{label}</span>

      <strong>
        {made}-{attempts}
      </strong>

      <small>{percentage}%</small>
    </div>
  );
}

function Level({
  type,
  icon,
  name,
  sub,
}: {
  type: string;
  icon: React.ReactNode;
  name: string;
  sub: string;
}) {
  return (
    <div className={`level ${type}`}>
      {icon}

      <div className="levelName">
        {name}
      </div>

      <div className="levelSub">
        {sub}
      </div>
    </div>
  );
}

function FlightNote({
  type,
  icon,
  title,
  body,
}: {
  type: string;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className={`flightNote ${type}`}>
      <div className="noteIcon">
        {icon}
      </div>

      <strong>{title}</strong>

      <p>{body}</p>
    </div>
  );
}

const stateCss = `
  .statePage {
    min-height: 100vh;
    background: #000;
    color: white;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    gap: 20px;

    padding: 24px;

    text-align: center;

    font-family:
      Arial,
      Helvetica,
      sans-serif;

    font-size: 11px;
    font-weight: 900;
    letter-spacing: .14em;
  }

  .statePage button {
    min-height: 48px;

    padding: 0 22px;

    border: 1px solid #8332d4;
    border-radius: 8px;

    background: #4a1679;
    color: white;

    font-weight: 900;
  }
`;
