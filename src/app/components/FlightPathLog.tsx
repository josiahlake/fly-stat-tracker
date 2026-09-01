"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Filter = "all" | "fall" | "winter" | "spring";

type Props = {
  playerId: string;
  onHome: () => void;
  onTrackGame: () => void;
  onOpenGame: (gameId: string) => void;
  onOpenPath: () => void;
  onOpenPlayer: () => void;
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
};

function getMonth(date: string) {
  return Number(date.split("-")[1] || 0);
}

function seasonFromDate(date: string): Exclude<Filter, "all"> {
  const month = getMonth(date);
  if (month >= 8 && month <= 11) return "fall";
  if (month === 12 || month === 1 || month === 2) return "winter";
  return "spring";
}

function dateParts(date: string) {
  if (!date) return { month: "—", day: "—", weekday: "" };
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, Math.max(0, month - 1), day);
  return {
    month: value.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(day),
    weekday: value.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
  };
}

function calculateResult(
  storedResult: string | null,
  flyScore: number | null,
  opponentScore: number | null
) {
  if (storedResult) return storedResult.toUpperCase();
  if (flyScore === null || opponentScore === null) return null;
  if (flyScore > opponentScore) return "W";
  if (flyScore < opponentScore) return "L";
  return "T";
}

function NavIcon({ type }: { type: "home" | "log" | "path" | "player" }) {
  if (type === "home") return <svg viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2V21h-6v-6H9v6H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
  if (type === "log") return <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M9 3h6v4H9zM9 11h6M9 15h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (type === "path") return <svg viewBox="0 0 24 24"><path d="m3 12 18-8-7 17-3-7-8-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 21c.6-4.3 3-6.5 7.5-6.5s6.9 2.2 7.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

export default function FlightPathLog({
  playerId,
  onHome,
  onTrackGame,
  onOpenGame,
  onOpenPath,
  onOpenPlayer,
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
        const { data: gameRows, error: gamesError } = await supabase
          .from("flight_games")
          .select("id,game_date,opponent_name,fly_score,opponent_score,result,created_at")
          .eq("player_id", playerId)
          .order("game_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100);

        if (gamesError) throw gamesError;

        if (!gameRows?.length) {
          if (!cancelled) setGames([]);
          return;
        }

        const ids = gameRows.map((game) => game.id);

        const { data: statRows, error: statsError } = await supabase
          .from("flight_game_stats")
          .select("game_id,two_pt_made,three_pt_made,ft_made,rebounds,assists,steals")
          .in("game_id", ids);

        if (statsError) throw statsError;

        const statsByGame = new Map((statRows ?? []).map((stat) => [stat.game_id, stat]));

        const merged = gameRows.map((game) => {
          const stat = statsByGame.get(game.id) as any;
          const twoMade = stat?.two_pt_made ?? 0;
          const threeMade = stat?.three_pt_made ?? 0;
          const ftMade = stat?.ft_made ?? 0;

          return {
            id: game.id,
            gameDate: game.game_date ?? "",
            opponentName: game.opponent_name || "Opponent",
            flyScore: game.fly_score ?? null,
            opponentScore: game.opponent_score ?? null,
            result: calculateResult(
              game.result ?? null,
              game.fly_score ?? null,
              game.opponent_score ?? null
            ),
            points: twoMade * 2 + threeMade * 3 + ftMade,
            rebounds: stat?.rebounds ?? 0,
            assists: stat?.assists ?? 0,
            steals: stat?.steals ?? 0,
          } satisfies CompletedGame;
        });

        if (!cancelled) setGames(merged);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load Flight Log.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGames();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const filteredGames = useMemo(
    () => filter === "all" ? games : games.filter((game) => seasonFromDate(game.gameDate) === filter),
    [games, filter]
  );

  async function shareLog() {
    const text = `FLIGHT PATH\nFLIGHT LOG\n${filteredGames.length} tracked games\n\nTrack your game. See your journey.`;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "Flight Path · Flight Log", text });
      } else {
        alert("Open Flight Path on your phone to use the native share sheet.");
      }
    } catch (err) {
      console.error("Share cancelled or unavailable:", err);
    }
  }

  if (loading) return <main className="statePage">LOADING FLIGHT LOG...<style>{styles}</style></main>;

  if (error) {
    return (
      <main className="statePage">
        <strong>WE COULDN&apos;T LOAD YOUR FLIGHT LOG.</strong>
        <span>{error}</span>
        <button type="button" onClick={onHome}>RETURN HOME</button>
        <style>{styles}</style>
      </main>
    );
  }

  return (
    <main className="logPage">
      <section className="phoneShell">
        <header className="brandHeader">
          <button type="button" className="backButton" onClick={onHome}>‹</button>

          <div className="brandCenter">
            <div className="academy">THE FLY ACADEMY</div>
            <div className="wordmarkRow">
              <div className="wordmark">FLIGHT LOG</div>
              <div className="brandPlane">
                <svg viewBox="0 0 64 64"><path d="M5 27L59 6L43 57L30 39L18 49L21 34L5 27Z" fill="currentColor"/><path d="M21 34L47 17L30 39" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity=".45"/></svg>
              </div>
            </div>
            <div className="tagline"><span>EVERY</span> GAME. <span>EVERY</span> MOMENT.</div>
          </div>

          <button type="button" className="shareButton" onClick={shareLog} aria-label="Share Flight Log">
            <svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L8 7m4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10H5.5A2.5 2.5 0 0 0 3 12.5v6A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-6a2.5 2.5 0 0 0-2.5-2.5H17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </header>

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
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value as Filter)}
            >
              {label}
            </button>
          ))}
        </section>

        <section className="listHeader">
          <strong>{filteredGames.length} {filteredGames.length === 1 ? "GAME" : "GAMES"}</strong>
          <span>MOST RECENT⌄</span>
        </section>

        <section className="gameList">
          {filteredGames.length === 0 ? (
            <div className="emptyState">
              <strong>NO GAMES YET</strong>
              <span>Completed games will appear here automatically.</span>
              <button type="button" onClick={onTrackGame}>＋ TRACK A GAME</button>
            </div>
          ) : (
            filteredGames.map((game) => {
              const date = dateParts(game.gameDate);
              const result = game.result ?? "—";
              const hasScore = game.flyScore !== null && game.opponentScore !== null;

              return (
                <button
                  key={game.id}
                  type="button"
                  className="gameCard"
                  onClick={() => onOpenGame(game.id)}
                >
                  <div className="dateBox">
                    <span className="month">{date.month}</span>
                    <strong>{date.day}</strong>
                    <span className="weekday">{date.weekday}</span>
                  </div>

                  <div className="gameMiddle">
                    <div className="opponent">vs {game.opponentName}</div>
                    <div className="statsRow">
                      <div className="gameStat gold"><strong>{game.points}</strong><span>PTS</span></div>
                      <div className="gameStat"><strong>{game.rebounds}</strong><span>REB</span></div>
                      <div className="gameStat cyan"><strong>{game.assists}</strong><span>AST</span></div>
                      <div className="gameStat"><strong>{game.steals}</strong><span>STL</span></div>
                    </div>
                  </div>

                  <div className={`resultBox ${result === "W" ? "win" : result === "L" ? "loss" : "tie"}`}>
                    <strong>{result}</strong>
                    {hasScore ? <span>{game.flyScore}–{game.opponentScore}</span> : null}
                  </div>

                  <div className="chevron">›</div>
                </button>
              );
            })
          )}
        </section>

        <nav className="bottomNav">
          <button type="button" className="navItem" onClick={onHome}><span className="navIcon"><NavIcon type="home"/></span><small>HOME</small></button>
          <button type="button" className="navItem active"><span className="navIcon"><NavIcon type="log"/></span><small>LOG</small></button>
          <button type="button" className="trackNav" onClick={onTrackGame}><span>＋</span><small>TRACK</small></button>
          <button type="button" className="navItem" onClick={onOpenPath}><span className="navIcon"><NavIcon type="path"/></span><small>PATH</small></button>
          <button type="button" className="navItem" onClick={onOpenPlayer}><span className="navIcon"><NavIcon type="player"/></span><small>PLAYER</small></button>
        </nav>
      </section>

      <style>{styles}</style>
    </main>
  );
}

const styles = `
  *{box-sizing:border-box}html,body{margin:0;background:#000}button{font:inherit;-webkit-tap-highlight-color:transparent}
  .statePage{min-height:100vh;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:Arial,Helvetica,sans-serif}.statePage span{color:#888;font-size:12px}.statePage button{min-height:46px;padding:0 18px;border:1px solid #8f36df;border-radius:8px;background:#401261;color:#fff;font-weight:900}
  .logPage{min-height:100vh;background:radial-gradient(circle at 50% -10%,#191919 0%,#070707 30%,#000 62%);color:#fff;padding:max(18px,env(safe-area-inset-top)) 14px calc(104px + env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}.phoneShell{width:100%;max-width:430px;margin:0 auto}
  .brandHeader{display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:start;padding:6px 0 27px}.backButton,.shareButton{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#fff;cursor:pointer}.backButton{font-size:38px;font-weight:200;justify-content:flex-start}.shareButton svg{width:24px;height:24px}.brandCenter{text-align:center}.academy{color:#9d9da2;font-size:10px;font-weight:850;letter-spacing:.25em;margin-bottom:9px}.wordmarkRow{display:flex;justify-content:center;align-items:center;gap:7px}.wordmark{font-size:clamp(35px,10vw,47px);line-height:.92;font-weight:1000;font-style:italic;letter-spacing:-.055em;white-space:nowrap}.brandPlane{width:36px;height:36px;flex:0 0 36px;color:#e5a719;transform:rotate(-7deg)}.brandPlane svg{width:100%;height:100%}.tagline{margin-top:14px;color:#f3f3f4;font-size:11px;line-height:1.4;font-weight:950;letter-spacing:.105em}.tagline span{color:#e5a719}
  .filters{display:grid;grid-template-columns:repeat(4,1fr);min-height:56px;margin-bottom:22px;border:1px solid #414146;border-radius:13px;overflow:hidden;background:#050506}.filters button{border:0;border-right:1px solid #2b2b30;background:transparent;color:#a4a4aa;font-size:11px;font-weight:950;cursor:pointer}.filters button:last-child{border-right:0}.filters button.active{color:#a84df5;background:linear-gradient(90deg,rgba(143,54,223,.18),rgba(143,54,223,.04));box-shadow:inset 0 0 0 1px #a84df5}
  .listHeader{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;color:#bcbcc1}.listHeader strong{font-size:11px;letter-spacing:.14em}.listHeader span{font-size:10px;font-weight:900;letter-spacing:.06em;color:#e6e6e8}.gameList{display:flex;flex-direction:column;gap:12px}.gameCard{width:100%;min-height:127px;display:grid;grid-template-columns:48px minmax(0,1fr) 57px 17px;gap:10px;align-items:center;padding:12px;border:1px solid #35353a;border-radius:14px;background:linear-gradient(180deg,#0d0d0f,#070708);color:#fff;text-align:left;cursor:pointer}.dateBox{min-height:94px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #393940;border-radius:10px;background:#080809;overflow:hidden}.dateBox .month{width:100%;padding:6px 2px;border-bottom:1px solid #482464;color:#a84df5;text-align:center;font-size:9px;font-weight:950}.dateBox strong{margin-top:5px;font-size:23px;line-height:1;font-weight:950}.dateBox .weekday{margin-top:6px;color:#939399;font-size:9px;font-weight:850}.gameMiddle{min-width:0}.opponent{overflow:hidden;margin-bottom:15px;color:#f5f5f6;font-size:15px;font-weight:950;white-space:nowrap;text-overflow:ellipsis}.statsRow{display:grid;grid-template-columns:repeat(4,1fr)}.gameStat{min-width:0;padding:0 7px;border-right:1px solid #29292e;text-align:center}.gameStat:last-child{border-right:0}.gameStat strong{display:block;font-size:20px;line-height:1;font-weight:950}.gameStat span{display:block;margin-top:5px;color:#929298;font-size:8px;font-weight:900}.gameStat.gold strong{color:#e5a719}.gameStat.cyan strong{color:#00bdd7}.resultBox{min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #57575c;border-radius:10px;background:#080809}.resultBox strong{font-size:27px}.resultBox span{margin-top:7px;font-size:10px;font-weight:950}.resultBox.win{border-color:#159138;color:#29d44a;background:rgba(13,137,43,.07)}.resultBox.loss{border-color:#a12530;color:#ff303d;background:rgba(170,20,30,.07)}.chevron{color:#c5c5ca;font-size:35px;font-weight:200}.emptyState{min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;border:1px dashed #333338;border-radius:15px;text-align:center}.emptyState span{max-width:260px;margin-top:9px;color:#88888e;font-size:12px}.emptyState button{min-height:48px;margin-top:20px;padding:0 24px;border:1px solid #9341d3;border-radius:9px;background:linear-gradient(110deg,#421369,#7024ad);color:white;font-size:12px;font-weight:950}
  .bottomNav{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,430px);height:78px;padding:7px 8px calc(7px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr 1.18fr 1fr 1fr;align-items:end;background:rgba(5,5,6,.97);backdrop-filter:blur(15px);border-top:1px solid #2d2d32;z-index:30}.navItem,.trackNav{border:0;background:transparent;color:#8a8a90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}.navItem.active{color:#a84df5}.navIcon{width:24px;height:24px;display:block}.navIcon svg{width:100%;height:100%}.navItem small,.trackNav small{font-size:8px;font-weight:950;letter-spacing:.05em}.trackNav{align-self:center;color:#d2d2d5}.trackNav>span{width:47px;height:47px;display:flex;align-items:center;justify-content:center;border:1px solid #9848d4;border-radius:50%;background:linear-gradient(135deg,#7c2db7,#4e176d);color:#fff;font-size:29px;line-height:1;box-shadow:0 0 19px rgba(121,43,182,.30)}
  @media(max-width:380px){.logPage{padding-left:9px;padding-right:9px}.brandHeader{grid-template-columns:35px minmax(0,1fr) 35px}.backButton,.shareButton{width:35px}.wordmark{font-size:35px}.brandPlane{width:30px;height:30px;flex-basis:30px}.gameCard{grid-template-columns:44px minmax(0,1fr) 52px 12px;gap:7px;padding:9px}.gameStat{padding:0 4px}.gameStat strong{font-size:18px}}
`;
