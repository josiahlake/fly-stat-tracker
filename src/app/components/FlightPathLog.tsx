"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Filter = "all" | "fall" | "winter" | "spring";

type Props = {
  playerId: string;
  onHome: () => void;
  onTrackGame: () => void;
  onOpenGame: (gameId: string) => void;
};

type CompletedGame = {
  id: string;
  gameDate: string;
  opponentName: string;

  flyScore: number | null;
  opponentScore: number | null;
  result: string | null;

  points: number;
  rebounds: number;
  assists: number;
  steals: number;

  twoMade: number;
  twoMissed: number;
  threeMade: number;
  threeMissed: number;
  ftMade: number;
  ftMissed: number;

  playingSeconds: number;
};

function getMonth(date: string) {
  if (!date) return 0;

  const parts = date.split("-");
  return Number(parts[1] || 0);
}

function seasonFromDate(date: string): Exclude<Filter, "all"> {
  const month = getMonth(date);

  if (month >= 8 && month <= 11) {
    return "fall";
  }

  if (month === 12 || month === 1 || month === 2) {
    return "winter";
  }

  return "spring";
}

function dateParts(date: string) {
  if (!date) {
    return {
      month: "—",
      day: "—",
      weekday: "",
    };
  }

  const [year, month, day] = date.split("-").map(Number);

  const value = new Date(
    year,
    Math.max(0, month - 1),
    day
  );

  return {
    month: value
      .toLocaleDateString("en-US", {
        month: "short",
      })
      .toUpperCase(),

    day: String(day),

    weekday: value
      .toLocaleDateString("en-US", {
        weekday: "short",
      })
      .toUpperCase(),
  };
}

function calculateResult(
  storedResult: string | null,
  flyScore: number | null,
  opponentScore: number | null
) {
  if (storedResult) {
    return storedResult.toUpperCase();
  }

  if (flyScore === null || opponentScore === null) {
    return null;
  }

  if (flyScore > opponentScore) return "W";
  if (flyScore < opponentScore) return "L";

  return "T";
}

export default function FlightPathLog({
  playerId,
  onHome,
  onTrackGame,
  onOpenGame,
}: Props) {
  const [games, setGames] = useState<CompletedGame[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadGames() {
      setLoading(true);
      setError("");

      try {
        const { data: gameRows, error: gamesError } =
          await supabase
            .from("flight_games")
            .select(`
              id,
              game_date,
              opponent_name,
              fly_score,
              opponent_score,
              result,
              created_at
            `)
            .eq("player_id", playerId)
            .order("game_date", {
              ascending: false,
            })
            .order("created_at", {
              ascending: false,
            })
            .limit(100);

        if (gamesError) {
          throw gamesError;
        }

        if (!gameRows || gameRows.length === 0) {
          if (!cancelled) {
            setGames([]);
          }

          return;
        }

        const gameIds = gameRows.map(
          (game) => game.id
        );

        const { data: statRows, error: statsError } =
          await supabase
            .from("flight_game_stats")
            .select(`
              game_id,
              two_pt_made,
              two_pt_missed,
              three_pt_made,
              three_pt_missed,
              ft_made,
              ft_missed,
              rebounds,
              assists,
              steals,
              playing_seconds
            `)
            .in("game_id", gameIds);

        if (statsError) {
          throw statsError;
        }

        const statsByGame = new Map(
          (statRows ?? []).map((stat) => [
            stat.game_id,
            stat,
          ])
        );

        const merged: CompletedGame[] =
          gameRows.map((game) => {
            const stat = statsByGame.get(
              game.id
            ) as any;

            const twoMade =
              stat?.two_pt_made ?? 0;

            const twoMissed =
              stat?.two_pt_missed ?? 0;

            const threeMade =
              stat?.three_pt_made ?? 0;

            const threeMissed =
              stat?.three_pt_missed ?? 0;

            const ftMade =
              stat?.ft_made ?? 0;

            const ftMissed =
              stat?.ft_missed ?? 0;

            return {
              id: game.id,

              gameDate:
                game.game_date ?? "",

              opponentName:
                game.opponent_name ||
                "Opponent",

              flyScore:
                game.fly_score ?? null,

              opponentScore:
                game.opponent_score ?? null,

              result: calculateResult(
                game.result ?? null,
                game.fly_score ?? null,
                game.opponent_score ?? null
              ),

              points:
                twoMade * 2 +
                threeMade * 3 +
                ftMade,

              rebounds:
                stat?.rebounds ?? 0,

              assists:
                stat?.assists ?? 0,

              steals:
                stat?.steals ?? 0,

              twoMade,
              twoMissed,
              threeMade,
              threeMissed,
              ftMade,
              ftMissed,

              playingSeconds:
                stat?.playing_seconds ?? 0,
            };
          });

        if (!cancelled) {
          setGames(merged);
        }
      } catch (err) {
        console.error(
          "Unable to load Flight Log:",
          err
        );

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load Flight Log."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGames();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const filteredGames = useMemo(() => {
    if (filter === "all") {
      return games;
    }

    return games.filter(
      (game) =>
        seasonFromDate(game.gameDate) === filter
    );
  }, [games, filter]);

  const seasonStats = useMemo(() => {
    const gameCount = filteredGames.length;

    const totals = filteredGames.reduce(
      (total, game) => {
        total.points += game.points;
        total.rebounds += game.rebounds;
        total.assists += game.assists;
        total.steals += game.steals;

        return total;
      },
      {
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
      }
    );

    return {
      games: gameCount,

      ppg: gameCount
        ? totals.points / gameCount
        : 0,

      rpg: gameCount
        ? totals.rebounds / gameCount
        : 0,

      apg: gameCount
        ? totals.assists / gameCount
        : 0,

      spg: gameCount
        ? totals.steals / gameCount
        : 0,
    };
  }, [filteredGames]);

  async function shareLog() {
    const label =
      filter === "all"
        ? "All Games"
        : filter.charAt(0).toUpperCase() +
          filter.slice(1);

    const text = [
      "FLIGHT PATH",
      "FLIGHT LOG",
      "",
      `${label} · ${seasonStats.games} ${
        seasonStats.games === 1
          ? "game"
          : "games"
      }`,
      "",
      `${seasonStats.ppg.toFixed(1)} PPG`,
      `${seasonStats.rpg.toFixed(1)} RPG`,
      `${seasonStats.apg.toFixed(1)} APG`,
      `${seasonStats.spg.toFixed(1)} SPG`,
      "",
      "Track your game. See your journey.",
    ].join("\n");

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: "Flight Path · Flight Log",
          text,
        });

        return;
      }

      alert(
        "Season sharing is ready for mobile. The polished PDF/share card is the next upgrade."
      );
    } catch (err) {
      console.error(
        "Share cancelled or unavailable:",
        err
      );
    }
  }

  if (loading) {
    return (
      <main className="statePage">
        LOADING FLIGHT LOG...
        <style>{stateStyles}</style>
      </main>
    );
  }

  if (error) {
    return (
      <main className="statePage">
        <strong>
          WE COULDN&apos;T LOAD YOUR FLIGHT LOG.
        </strong>

        <span>{error}</span>

        <button
          type="button"
          onClick={onHome}
        >
          RETURN HOME
        </button>

        <style>{stateStyles}</style>
      </main>
    );
  }

  return (
    <main className="logPage">
      <section className="phoneShell">

        {/* HEADER */}

        <header className="brandHeader">
          <button
            type="button"
            className="backButton"
            onClick={onHome}
            aria-label="Return home"
          >
            ‹
          </button>

          <div className="brandCenter">
            <div className="academy">
              THE FLY ACADEMY
            </div>

            <div className="wordmarkRow">
              <div className="wordmark">
                FLIGHT LOG
              </div>

              <div className="brandPlane">
                <svg
                  viewBox="0 0 64 64"
                  aria-hidden="true"
                >
                  <path
                    d="M5 27L59 6L43 57L30 39L18 49L21 34L5 27Z"
                    fill="currentColor"
                  />

                  <path
                    d="M21 34L47 17L30 39"
                    stroke="#000"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity=".45"
                  />
                </svg>
              </div>
            </div>

            <div className="tagline">
              <span>EVERY</span> GAME.{" "}
              <span>EVERY</span> MOMENT.
            </div>
          </div>

          <button
            type="button"
            className="shareButton"
            onClick={shareLog}
            aria-label="Share Flight Log"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M12 15V3m0 0L8 7m4-4 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M7 10H5.5A2.5 2.5 0 0 0 3 12.5v6A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-6a2.5 2.5 0 0 0-2.5-2.5H17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* FILTERS */}

        <section className="filters">
          {[
            ["all", "ALL GAMES"],
            ["fall", "FALL"],
            ["winter", "WINTER"],
            ["spring", "SPRING"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={
                filter === value
                  ? "active"
                  : ""
              }
              onClick={() =>
                setFilter(value as Filter)
              }
            >
              {label}
            </button>
          ))}
        </section>

        {/* COUNT / SORT */}

        <section className="listHeader">
          <strong>
            {filteredGames.length}{" "}
            {filteredGames.length === 1
              ? "GAME"
              : "GAMES"}
          </strong>

          <span>
            MOST RECENT⌄
          </span>
        </section>

        {/* GAME LIST */}

        <section className="gameList">
          {filteredGames.length === 0 ? (
            <div className="emptyState">
              <div className="emptyIcon">
                ▣
              </div>

              <strong>
                NO GAMES YET
              </strong>

              <span>
                Completed games will appear here automatically.
              </span>

              <button
                type="button"
                onClick={onTrackGame}
              >
                ＋ TRACK A GAME
              </button>
            </div>
          ) : (
            filteredGames.map((game) => {
              const date = dateParts(
                game.gameDate
              );

              const result =
                game.result ?? "—";

              const hasScore =
                game.flyScore !== null &&
                game.opponentScore !== null;

              return (
                <button
                  key={game.id}
                  type="button"
                  className="gameCard"
                  onClick={() =>
                    onOpenGame(game.id)
                  }
                >
                  <div className="dateBox">
                    <span className="month">
                      {date.month}
                    </span>

                    <strong>
                      {date.day}
                    </strong>

                    <span className="weekday">
                      {date.weekday}
                    </span>
                  </div>

                  <div className="gameMiddle">
                    <div className="opponent">
                      vs {game.opponentName}
                    </div>

                    <div className="statsRow">
                      <GameStat
                        value={game.points}
                        label="PTS"
                        accent="gold"
                      />

                      <GameStat
                        value={game.rebounds}
                        label="REB"
                      />

                      <GameStat
                        value={game.assists}
                        label="AST"
                        accent="cyan"
                      />

                      <GameStat
                        value={game.steals}
                        label="STL"
                      />
                    </div>
                  </div>

                  <div
                    className={`resultBox ${
                      result === "W"
                        ? "win"
                        : result === "L"
                        ? "loss"
                        : "tie"
                    }`}
                  >
                    <strong>
                      {result}
                    </strong>

                    {hasScore && (
                      <span>
                        {game.flyScore}–
                        {game.opponentScore}
                      </span>
                    )}
                  </div>

                  <div className="chevron">
                    ›
                  </div>
                </button>
              );
            })
          )}
        </section>

        {/* BOTTOM NAV */}

        <nav className="bottomNav">
          <button
            type="button"
            className="navItem"
            onClick={onHome}
          >
            <span className="navIcon">
              <HomeIcon />
            </span>

            <small>
              HOME
            </small>
          </button>

          <button
            type="button"
            className="navItem active"
          >
            <span className="navIcon">
              <LogIcon />
            </span>

            <small>
              LOG
            </small>
          </button>

          <button
            type="button"
            className="trackNav"
            onClick={onTrackGame}
          >
            <span>
              ＋
            </span>

            <small>
              TRACK
            </small>
          </button>

          <button
            type="button"
            className="navItem"
            onClick={() =>
              alert(
                "Flight Path view is next."
              )
            }
          >
            <span className="navIcon">
              <PathIcon />
            </span>

            <small>
              PATH
            </small>
          </button>

          <button
            type="button"
            className="navItem"
            onClick={() =>
              alert(
                "Player profile is coming next."
              )
            }
          >
            <span className="navIcon">
              <PlayerIcon />
            </span>

            <small>
              PLAYER
            </small>
          </button>
        </nav>
      </section>

      <style>{styles}</style>
    </main>
  );
}

function GameStat({
  value,
  label,
  accent = "white",
}: {
  value: number;
  label: string;
  accent?: "white" | "gold" | "cyan";
}) {
  return (
    <div className={`gameStat ${accent}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M3 11.2 12 4l9 7.2V21h-6v-6H9v6H3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="5"
        y="4"
        width="14"
        height="17"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <path
        d="M9 3h6v4H9zM9 11h6M9 15h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="m3 12 18-8-7 17-3-7-8-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="7"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />

      <path
        d="M4.5 21c.6-4.3 3-6.5 7.5-6.5s6.9 2.2 7.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const stateStyles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    background: #000;
  }

  .statePage {
    min-height: 100vh;
    background: #000;
    color: #fff;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    gap: 18px;

    padding: 24px;

    text-align: center;

    font-family:
      Arial,
      Helvetica,
      sans-serif;
  }

  .statePage strong {
    font-size: 15px;
  }

  .statePage span {
    max-width: 320px;
    color: #888;
    font-size: 12px;
    line-height: 1.5;
  }

  .statePage button {
    min-height: 48px;

    border: 1px solid #8f36df;
    border-radius: 8px;

    background: #401261;
    color: #fff;

    padding: 0 20px;

    font-weight: 900;
  }
`;

const styles = `
  ${stateStyles}

  :root {
    --gold: #e5a719;
    --purple: #9b41e8;
    --cyan: #00bdd7;
    --green: #29d44a;
    --red: #ff303d;

    --white: #ffffff;
    --muted: #929298;
    --line: #303035;
  }

  button {
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .logPage {
    min-height: 100vh;

    background:
      radial-gradient(
        circle at 50% -10%,
        #191919 0%,
        #070707 30%,
        #000000 62%
      );

    color: #fff;

    padding:
      max(18px, env(safe-area-inset-top))
      14px
      calc(104px + env(safe-area-inset-bottom));

    font-family:
      Arial,
      Helvetica,
      sans-serif;
  }

  .phoneShell {
    width: 100%;
    max-width: 430px;
    margin: 0 auto;
  }

  /* HEADER */

  .brandHeader {
    display: grid;

    grid-template-columns:
      42px
      minmax(0, 1fr)
      42px;

    align-items: start;

    padding:
      6px
      0
      27px;
  }

  .backButton,
  .shareButton {
    width: 42px;
    height: 42px;

    display: flex;
    align-items: center;
    justify-content: center;

    border: 0;

    background: transparent;
    color: #fff;

    cursor: pointer;
  }

  .backButton {
    font-size: 38px;
    font-weight: 200;
    justify-content: flex-start;
  }

  .shareButton svg {
    width: 24px;
    height: 24px;
  }

  .brandCenter {
    min-width: 0;
    text-align: center;
  }

  .academy {
    color: #9d9da2;

    font-size: 10px;
    font-weight: 850;

    letter-spacing: .25em;

    margin-bottom: 9px;
  }

  .wordmarkRow {
    display: flex;

    justify-content: center;
    align-items: center;

    gap: 7px;
  }

  .wordmark {
    color: #fff;

    font-size:
      clamp(
        35px,
        10vw,
        47px
      );

    line-height: .92;

    font-weight: 1000;
    font-style: italic;

    letter-spacing: -.055em;

    white-space: nowrap;
  }

  .brandPlane {
    width: 36px;
    height: 36px;

    flex: 0 0 36px;

    color: var(--gold);

    transform:
      rotate(-7deg);
  }

  .brandPlane svg {
    width: 100%;
    height: 100%;
  }

  .tagline {
    margin-top: 14px;

    color: #f3f3f4;

    font-size: 11px;
    line-height: 1.4;

    font-weight: 950;
    letter-spacing: .105em;
  }

  .tagline span {
    color: var(--gold);
  }

  /* FILTER */

  .filters {
    display: grid;

    grid-template-columns:
      repeat(4, 1fr);

    min-height: 56px;

    margin-bottom: 22px;

    border:
      1px solid #414146;

    border-radius: 13px;

    overflow: hidden;

    background: #050506;
  }

  .filters button {
    border: 0;
    border-right:
      1px solid #2b2b30;

    background: transparent;

    color: #a4a4aa;

    font-size: 11px;
    font-weight: 950;

    cursor: pointer;
  }

  .filters button:last-child {
    border-right: 0;
  }

  .filters button.active {
    color: var(--purple);

    background:
      linear-gradient(
        90deg,
        rgba(143,54,223,.18),
        rgba(143,54,223,.04)
      );

    box-shadow:
      inset 0 0 0 1px
      var(--purple);
  }

  /* LIST HEADER */

  .listHeader {
    display: flex;

    align-items: center;
    justify-content: space-between;

    margin-bottom: 12px;

    color: #bcbcc1;
  }

  .listHeader strong {
    font-size: 11px;
    letter-spacing: .14em;
  }

  .listHeader span {
    font-size: 10px;
    font-weight: 900;

    letter-spacing: .06em;

    color: #e6e6e8;
  }

  /* GAME LIST */

  .gameList {
    display: flex;
    flex-direction: column;

    gap: 12px;
  }

  .gameCard {
    width: 100%;

    min-height: 127px;

    display: grid;

    grid-template-columns:
      48px
      minmax(0, 1fr)
      57px
      17px;

    gap: 10px;

    align-items: center;

    padding: 12px;

    border:
      1px solid #35353a;

    border-radius: 14px;

    background:
      linear-gradient(
        180deg,
        #0d0d0f,
        #070708
      );

    color: #fff;

    text-align: left;

    cursor: pointer;

    box-shadow:
      inset 0 0 18px
      rgba(255,255,255,.012);
  }

  .gameCard:active {
    transform:
      scale(.99);

    border-color:
      #65308c;
  }

  .dateBox {
    min-height: 94px;

    display: flex;
    flex-direction: column;

    align-items: center;
    justify-content: center;

    border:
      1px solid #393940;

    border-radius: 10px;

    background: #080809;

    overflow: hidden;
  }

  .dateBox .month {
    width: 100%;

    padding:
      6px
      2px;

    border-bottom:
      1px solid #482464;

    color: var(--purple);

    text-align: center;

    font-size: 9px;
    font-weight: 950;
  }

  .dateBox strong {
    margin-top: 5px;

    font-size: 23px;
    line-height: 1;

    font-weight: 950;
  }

  .dateBox .weekday {
    margin-top: 6px;

    color: #939399;

    font-size: 9px;
    font-weight: 850;
  }

  .gameMiddle {
    min-width: 0;
  }

  .opponent {
    overflow: hidden;

    margin-bottom: 15px;

    color: #f5f5f6;

    font-size: 15px;
    font-weight: 950;

    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .statsRow {
    display: grid;

    grid-template-columns:
      repeat(4, 1fr);
  }

  .gameStat {
    min-width: 0;

    padding:
      0
      7px;

    border-right:
      1px solid #29292e;

    text-align: center;
  }

  .gameStat:first-child {
    padding-left: 0;
  }

  .gameStat:last-child {
    border-right: 0;
  }

  .gameStat strong {
    display: block;

    font-size: 20px;
    line-height: 1;

    font-weight: 950;
  }

  .gameStat span {
    display: block;

    margin-top: 5px;

    color: #929298;

    font-size: 8px;
    font-weight: 900;

    letter-spacing: .06em;
  }

  .gameStat.gold strong {
    color: var(--gold);
  }

  .gameStat.cyan strong {
    color: var(--cyan);
  }

  /* RESULT */

  .resultBox {
    min-height: 72px;

    display: flex;
    flex-direction: column;

    align-items: center;
    justify-content: center;

    border:
      1px solid #57575c;

    border-radius: 10px;

    background: #080809;
  }

  .resultBox strong {
    font-size: 27px;
    line-height: 1;

    font-weight: 950;
  }

  .resultBox span {
    margin-top: 7px;

    font-size: 10px;
    font-weight: 950;
  }

  .resultBox.win {
    border-color:
      #159138;

    color:
      var(--green);

    background:
      rgba(13,137,43,.07);
  }

  .resultBox.loss {
    border-color:
      #a12530;

    color:
      var(--red);

    background:
      rgba(170,20,30,.07);
  }

  .resultBox.tie {
    color: #ddd;

    border-color:
      #66666c;
  }

  .chevron {
    color: #c5c5ca;

    font-size: 35px;
    font-weight: 200;

    line-height: 1;
  }

  /* EMPTY */

  .emptyState {
    min-height: 280px;

    display: flex;
    flex-direction: column;

    align-items: center;
    justify-content: center;

    padding: 30px;

    border:
      1px dashed #333338;

    border-radius: 15px;

    text-align: center;
  }

  .emptyIcon {
    color: var(--purple);

    font-size: 34px;

    margin-bottom: 13px;
  }

  .emptyState strong {
    font-size: 16px;

    letter-spacing: .08em;
  }

  .emptyState span {
    max-width: 260px;

    margin-top: 9px;

    color: #88888e;

    font-size: 12px;
    line-height: 1.5;
  }

  .emptyState button {
    min-height: 48px;

    margin-top: 20px;

    padding:
      0
      24px;

    border:
      1px solid #9341d3;

    border-radius: 9px;

    background:
      linear-gradient(
        110deg,
        #421369,
        #7024ad
      );

    color: white;

    font-size: 12px;
    font-weight: 950;
  }

  /* NAV */

  .bottomNav {
    position: fixed;

    left: 50%;
    bottom: 0;

    transform:
      translateX(-50%);

    width:
      min(
        100%,
        430px
      );

    height: 78px;

    padding:
      7px
      8px
      calc(
        7px +
        env(safe-area-inset-bottom)
      );

    display: grid;

    grid-template-columns:
      1fr
      1fr
      1.18fr
      1fr
      1fr;

    align-items: end;

    background:
      rgba(5,5,6,.97);

    backdrop-filter:
      blur(15px);

    border-top:
      1px solid #2d2d32;

    z-index: 30;
  }

  .navItem,
  .trackNav {
    border: 0;

    background: transparent;

    color: #8a8a90;

    display: flex;
    flex-direction: column;

    align-items: center;
    justify-content: center;

    gap: 4px;

    cursor: pointer;
  }

  .navItem.active {
    color: var(--purple);
  }

  .navIcon {
    width: 24px;
    height: 24px;

    display: block;
  }

  .navIcon svg {
    width: 100%;
    height: 100%;
  }

  .navItem small,
  .trackNav small {
    font-size: 8px;

    font-weight: 950;
    letter-spacing: .05em;
  }

  .trackNav {
    align-self: center;

    color: #d2d2d5;
  }

  .trackNav > span {
    width: 47px;
    height: 47px;

    display: flex;

    align-items: center;
    justify-content: center;

    border:
      1px solid #9848d4;

    border-radius: 50%;

    background:
      linear-gradient(
        135deg,
        #7c2db7,
        #4e176d
      );

    color: #fff;

    font-size: 29px;
    line-height: 1;

    box-shadow:
      0 0 19px
      rgba(121,43,182,.30);
  }

  @media (max-width: 380px) {
    .logPage {
      padding-left: 9px;
      padding-right: 9px;
    }

    .brandHeader {
      grid-template-columns:
        35px
        minmax(0,1fr)
        35px;
    }

    .backButton,
    .shareButton {
      width: 35px;
    }

    .wordmark {
      font-size: 35px;
    }

    .brandPlane {
      width: 30px;
      height: 30px;
      flex-basis: 30px;
    }

    .tagline {
      font-size: 10px;
      letter-spacing: .075em;
    }

    .filters button {
      font-size: 9px;
    }

    .gameCard {
      grid-template-columns:
        44px
        minmax(0,1fr)
        52px
        12px;

      gap: 7px;

      padding: 9px;
    }

    .dateBox {
      min-height: 88px;
    }

    .opponent {
      font-size: 13px;
    }

    .gameStat {
      padding:
        0
        4px;
    }

    .gameStat strong {
      font-size: 18px;
    }

    .resultBox {
      min-height: 66px;
    }

    .resultBox strong {
      font-size: 24px;
    }

    .chevron {
      font-size: 29px;
    }
  }
`;
