"use client";

import FlightLevelMark from "./FlightLevelMark";
import { useEffect, useMemo, useState } from "react";
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

type LiveGameDraft = {
  opponentName: string;
  gameDate: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  fouls: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
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
  turnovers: number;
  blocks: number;
  fouls: number;
  playingSeconds: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
};

type Props = {
  playerId: string;
  onStartGame?: () => void;
  onOpenLog?: () => void;
  onOpenPath?: () => void;
};

function extractLevel(teamName: string | null) {
  if (!teamName) return "ASCEND";
  const match = teamName.match(/\[([^\]]+)\]/);
  return (match?.[1] || "ASCEND").toUpperCase();
}

function levelClass(level: string) {
  if (level.includes("ELEVATE")) return "elevate";
  if (level.includes("AIR")) return "air";
  if (level.includes("SELECT")) return "select";
  return "ascend";
}

function initials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function formatGameDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

function pct(made: number, attempts: number) {
  if (!attempts) return 0;
  return (made / attempts) * 100;
}

function formatPlayingTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="miniStat">
      <div className="miniLabel">{label}</div>
      <div className="miniValue">{value}</div>
    </div>
  );
}

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="seasonStat">
      <div className="seasonValue">{value}</div>
      <div className="seasonLabel">{label}</div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`navItem ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="navIcon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function FlightPathPlayerHome({
  playerId,
  onStartGame,
  onOpenLog,
  onOpenPath,
}: Props) {
  const [data, setData] = useState<PlayerHomeData | null>(null);
  const [liveGame, setLiveGame] = useState<LiveGameDraft | null>(null);
  const [completedGames, setCompletedGames] = useState<CompletedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerHome() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) throw new Error("Please sign in again.");

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
            teams (display_name),
            seasons (name)
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

        const { data: draft, error: draftError } = await supabase
          .from("flight_game_drafts")
          .select(`
            game_date,
            opponent_name,
            two_pt_made,
            two_pt_missed,
            three_pt_made,
            three_pt_missed,
            ft_made,
            ft_missed,
            offensive_rebounds,
            defensive_rebounds,
            assists,
            steals,
            turnovers,
            fouls
          `)
          .eq("player_id", playerId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (draftError) throw draftError;

        const { data: games, error: gamesError } = await supabase
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
          .order("game_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);

        if (gamesError) throw gamesError;

        let mergedGames: CompletedGame[] = [];

        if (games && games.length > 0) {
          const gameIds = games.map((game) => game.id);

          const { data: stats, error: statsError } = await supabase
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
              turnovers,
              blocks,
              fouls,
              playing_seconds
            `)
            .in("game_id", gameIds);

          if (statsError) throw statsError;

          const statsByGame = new Map(
            (stats ?? []).map((stat) => [stat.game_id, stat])
          );

          mergedGames = games.map((game) => {
            const stat = statsByGame.get(game.id) as any;
            const twoMade = stat?.two_pt_made ?? 0;
            const twoMissed = stat?.two_pt_missed ?? 0;
            const threeMade = stat?.three_pt_made ?? 0;
            const threeMissed = stat?.three_pt_missed ?? 0;
            const ftMade = stat?.ft_made ?? 0;
            const ftMissed = stat?.ft_missed ?? 0;
            const fgMade = twoMade + threeMade;
            const fgAttempts = fgMade + twoMissed + threeMissed;

            return {
              id: game.id,
              gameDate: game.game_date ?? "",
              opponentName: game.opponent_name || "Opponent",
              flyScore: game.fly_score ?? null,
              opponentScore: game.opponent_score ?? null,
              result: game.result ?? null,
              points: twoMade * 2 + threeMade * 3 + ftMade,
              rebounds: stat?.rebounds ?? 0,
              assists: stat?.assists ?? 0,
              steals: stat?.steals ?? 0,
              turnovers: stat?.turnovers ?? 0,
              blocks: stat?.blocks ?? 0,
              fouls: stat?.fouls ?? 0,
              playingSeconds: stat?.playing_seconds ?? 0,
              fieldGoalsMade: fgMade,
              fieldGoalsAttempted: fgAttempts,
              threePointersMade: threeMade,
              threePointersAttempted: threeMade + threeMissed,
              freeThrowsMade: ftMade,
              freeThrowsAttempted: ftMade + ftMissed,
            };
          });
        }

        if (cancelled) return;
        setCompletedGames(mergedGames);

        if (draft) {
          const fgMade = (draft.two_pt_made ?? 0) + (draft.three_pt_made ?? 0);
          const fgAttempts =
            fgMade +
            (draft.two_pt_missed ?? 0) +
            (draft.three_pt_missed ?? 0);
          const threeMade = draft.three_pt_made ?? 0;
          const threeAttempts = threeMade + (draft.three_pt_missed ?? 0);
          const ftMade = draft.ft_made ?? 0;
          const ftAttempts = ftMade + (draft.ft_missed ?? 0);

          setLiveGame({
            opponentName: draft.opponent_name || "Opponent",
            gameDate: draft.game_date || "",
            points:
              (draft.two_pt_made ?? 0) * 2 +
              (draft.three_pt_made ?? 0) * 3 +
              (draft.ft_made ?? 0),
            rebounds:
              (draft.offensive_rebounds ?? 0) +
              (draft.defensive_rebounds ?? 0),
            assists: draft.assists ?? 0,
            steals: draft.steals ?? 0,
            turnovers: draft.turnovers ?? 0,
            fouls: draft.fouls ?? 0,
            fieldGoalsMade: fgMade,
            fieldGoalsAttempted: fgAttempts,
            threePointersMade: threeMade,
            threePointersAttempted: threeAttempts,
            freeThrowsMade: ftMade,
            freeThrowsAttempted: ftAttempts,
          });
        } else {
          setLiveGame(null);
        }

        setData({
          playerId: player.id,
          firstName: player.first_name,
          lastName: player.last_name,
          jerseyNumber: membership?.jersey_number ?? null,
          teamName:
            (membership?.teams as { display_name?: string } | null)?.display_name ??
            null,
          seasonName:
            (membership?.seasons as { name?: string } | null)?.name ?? null,
          gamesTotal: entitlement?.games_total ?? 0,
          gamesUsed: entitlement?.games_used ?? 0,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load Flight Path.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlayerHome();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const gamesRemaining = useMemo(
    () => Math.max((data?.gamesTotal ?? 0) - (data?.gamesUsed ?? 0), 0),
    [data]
  );

  const season = useMemo(() => {
    const games = completedGames.length;

    const totals = completedGames.reduce(
      (acc, game) => {
        acc.points += game.points;
        acc.rebounds += game.rebounds;
        acc.assists += game.assists;
        acc.steals += game.steals;
        acc.fgm += game.fieldGoalsMade;
        acc.fga += game.fieldGoalsAttempted;
        return acc;
      },
      { points: 0, rebounds: 0, assists: 0, steals: 0, fgm: 0, fga: 0 }
    );

    return {
      games,
      ppg: games ? totals.points / games : 0,
      rpg: games ? totals.rebounds / games : 0,
      apg: games ? totals.assists / games : 0,
      spg: games ? totals.steals / games : 0,
      fgPct: pct(totals.fgm, totals.fga),
    };
  }, [completedGames]);

  const lastFive = useMemo(() => completedGames.slice(0, 5), [completedGames]);

  const lastFivePpg = useMemo(() => {
    if (!lastFive.length) return 0;
    return lastFive.reduce((sum, game) => sum + game.points, 0) / lastFive.length;
  }, [lastFive]);

  const lastFiveDelta = lastFive.length ? lastFivePpg - season.ppg : 0;
  const lastGame = completedGames[0] ?? null;

  if (loading) {
    return (
      <main className="statePage">
        <div className="loadingLabel">LOADING FLIGHT PATH...</div>
        <style>{styles}</style>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="statePage">
        <div className="errorState">
          <strong>Unable to load player.</strong>
          <span>{error}</span>
        </div>
        <style>{styles}</style>
      </main>
    );
  }

  const playerName = `${data.firstName} ${data.lastName}`.trim();
  const level = extractLevel(data.teamName);
  const currentLevelClass = levelClass(level);

  return (
    <main className="homePage">
      <section className="phoneShell">
        <header className="topBar">
          <div className="brand">
            <span>FLIGHT PATH</span>
            <span className="plane">➤</span>
          </div>

          <button
            className="iconButton"
            type="button"
            aria-label="Notifications"
          >
            ♢
          </button>
        </header>

        <section className="playerHero">
          <div className="avatar">
            <div className="avatarInner">
              {initials(data.firstName, data.lastName)}
            </div>
          </div>

          <div className="playerIdentity">
            <div className="playerName">{playerName}</div>

            <div className="playerMeta">
              {data.jerseyNumber ? <span>#{data.jerseyNumber}</span> : null}
              {data.jerseyNumber && data.teamName ? <span className="dot">•</span> : null}
              {data.teamName ? (
                <span>
                  {data.teamName.replace(/\s*\[[^\]]+\]\s*/, "")}
                </span>
              ) : null}
            </div>

            <div className={`level ${currentLevelClass}`}>
              {level}
              <span className="levelMark">
                {currentLevelClass === "air"
                  ? "➤"
                  : currentLevelClass === "select"
                  ? "☆"
                  : "⌃"}
              </span>
            </div>
          </div>
        </section>

        <button className="seasonButton" type="button">
          <span>{data.seasonName ?? "CURRENT SEASON"}</span>
          <span>⌄</span>
        </button>

        {liveGame ? (
          <section className="liveGameCard">
            <div className="liveTop">
              <div>
                <div className="liveLabel">
                  <span className="liveDot" /> GAME IN PROGRESS
                </div>

                <div className="liveOpponent">
                  vs. {liveGame.opponentName}
                </div>
              </div>

              <div className="autoSave">AUTO-SAVED ✓</div>
            </div>

            <div className="liveStats">
              <Stat label="PTS" value={liveGame.points} />
              <Stat label="REB" value={liveGame.rebounds} />
              <Stat label="AST" value={liveGame.assists} />
              <Stat label="STL" value={liveGame.steals} />
            </div>

            <div className="shootingLine">
              FG {liveGame.fieldGoalsMade}-{liveGame.fieldGoalsAttempted}
              <span>•</span>
              3PT {liveGame.threePointersMade}-{liveGame.threePointersAttempted}
              <span>•</span>
              FT {liveGame.freeThrowsMade}-{liveGame.freeThrowsAttempted}
            </div>

            <button
              type="button"
              className="trackButton resume"
              onClick={onStartGame}
            >
              RESUME GAME <span>→</span>
            </button>
          </section>
        ) : (
          <>
            <button
              type="button"
              className="trackButton"
              onClick={onStartGame}
            >
              <span className="plus">＋</span> TRACK A GAME
            </button>

            <div className="accessLine">
              {gamesRemaining === 1
                ? "1 GAME REMAINING"
                : `${gamesRemaining} GAMES REMAINING`}
            </div>
          </>
        )}

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>SEASON STATS</span>
            <span className="sectionMeta">
              {season.games} {season.games === 1 ? "GAME" : "GAMES"}
            </span>
          </div>

          <div className="seasonGrid">
            <SeasonStat value={season.ppg.toFixed(1)} label="PPG" />
            <SeasonStat value={season.rpg.toFixed(1)} label="RPG" />
            <SeasonStat value={season.apg.toFixed(1)} label="APG" />
            <SeasonStat value={season.spg.toFixed(1)} label="STL" />
            <SeasonStat value={`${season.fgPct.toFixed(0)}%`} label="FG%" />
          </div>
        </section>

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>LAST 5 GAMES</span>
            <span className="sectionMeta">
              {lastFive.length ? `${lastFive.length} PLAYED` : "NO GAMES"}
            </span>
          </div>

          {lastFive.length ? (
            <div className="trendLive">
              <div>
                <div className="trendValue">{lastFivePpg.toFixed(1)}</div>
                <div className="trendLabel">PPG</div>
              </div>

              <div className="sparkline" aria-label="Points in last five games">
                {lastFive
                  .slice()
                  .reverse()
                  .map((game) => {
                    const max = Math.max(
                      ...lastFive.map((item) => item.points),
                      1
                    );

                    const height = 14 + (game.points / max) * 32;

                    return (
                      <span
                        key={game.id}
                        style={{
                          height: `${height}px`,
                        }}
                      >
                        <i>{game.points}</i>
                      </span>
                    );
                  })}
              </div>

              <div
                className={`trendCompare ${
                  lastFiveDelta >= 0 ? "up" : "down"
                }`}
              >
                <strong>
                  {lastFiveDelta >= 0 ? "+" : ""}
                  {lastFiveDelta.toFixed(1)}
                </strong>

                <span>VS SEASON</span>
              </div>
            </div>
          ) : (
            <div className="emptyGame">
              Your last-five trend will appear after completed games.
            </div>
          )}
        </section>

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>LAST GAME</span>
          </div>

          {lastGame ? (
            <div className="lastGameCard">
              <div className="lastGameTop">
                <div>
                  <div className="lastOpponent">
                    vs. {lastGame.opponentName}
                  </div>

                  <div className="lastDate">
                    {formatGameDate(lastGame.gameDate)}
                  </div>
                </div>

                <div
                  className={`resultBadge ${(
                    lastGame.result || ""
                  ).toLowerCase()}`}
                >
                  {lastGame.result ?? "—"}

                  {lastGame.flyScore !== null &&
                  lastGame.opponentScore !== null ? (
                    <span>
                      {lastGame.flyScore}-{lastGame.opponentScore}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="lastStats">
                <Stat label="PTS" value={lastGame.points} />
                <Stat label="REB" value={lastGame.rebounds} />
                <Stat label="AST" value={lastGame.assists} />
                <Stat label="STL" value={lastGame.steals} />
              </div>

              <div className="lastGameMeta">
                FG {lastGame.fieldGoalsMade}-{lastGame.fieldGoalsAttempted}
                <span>•</span>
                3PT {lastGame.threePointersMade}-{lastGame.threePointersAttempted}
                <span>•</span>
                FT {lastGame.freeThrowsMade}-{lastGame.freeThrowsAttempted}

                {lastGame.playingSeconds > 0 ? (
                  <>
                    <span>•</span>
                    {formatPlayingTime(lastGame.playingSeconds)} MIN
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="emptyGame">
              Complete your first game to begin building your Flight Path.
            </div>
          )}
        </section>

        <section className="pathCard">
          <div className="sectionHeader">
            <span>YOUR FLIGHT PATH</span>
          </div>

          <div className="pathLevels">
            <FlightLevelMark level="elevate" showName size="sm" />

            <div className="pathLine" />

            <FlightLevelMark level="ascend" showName size="sm" />

            <div className="pathLine" />

            <FlightLevelMark level="air" showName size="sm" />

            <div className="pathLine" />

            <FlightLevelMark level="select" showName size="sm" />
          </div>
        </section>

        <nav className="bottomNav">
          <NavItem icon="⌂" label="HOME" active />

          <NavItem
            icon="▣"
            label="LOG"
            onClick={onOpenLog}
          />

          <button
            type="button"
            className="trackNav"
            onClick={onStartGame}
          >
            <span>＋</span>
            <small>TRACK</small>
          </button>

          <NavItem icon="➤" label="PATH" onClick={onOpenPath} />

          <NavItem icon="♙" label="PLAYER" />
        </nav>
      </section>

      <style>{styles}</style>
    </main>
  );
}

const stateStyles = `
  *{box-sizing:border-box}html,body{margin:0;background:#000}
  .statePage{min-height:100vh;background:#030303;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,Helvetica,sans-serif}
  .loadingLabel{font-size:11px;letter-spacing:.22em;color:#777;font-weight:800}
  .errorState{display:flex;flex-direction:column;gap:10px;text-align:center}.errorState strong{font-size:22px}.errorState span{color:#999;font-size:14px}
`;

const styles = `${stateStyles}
  button{font:inherit}
  .homePage{min-height:100vh;background:radial-gradient(circle at 50% -10%,#181818 0%,#060606 30%,#000 62%);color:#fff;padding:max(18px,env(safe-area-inset-top)) 14px calc(104px + env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}
  .phoneShell{width:100%;max-width:430px;margin:0 auto}
  .topBar{height:58px;display:flex;align-items:center;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:7px;font-size:17px;font-weight:950;font-style:italic;letter-spacing:-.03em}
  .plane{display:inline-block;color:#d59b21;font-size:20px;transform:rotate(-26deg)}
  .iconButton{width:46px;height:46px;border:0;background:transparent;color:#fff;font-size:27px;cursor:pointer}

  .playerHero{display:flex;align-items:center;gap:17px;padding:18px 0 20px}
  .avatar{width:88px;height:88px;flex:0 0 88px;padding:2px;border-radius:50%;background:linear-gradient(145deg,#a34eea,#582082,#d59b21)}
  .avatarInner{width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:50%;background:radial-gradient(circle at 50% 35%,#27272c,#0b0b0d 70%);font-size:28px;font-weight:950}
  .playerIdentity{min-width:0}
  .playerName{font-size:29px;line-height:1;font-weight:950;text-transform:uppercase;letter-spacing:-.04em}
  .playerMeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;color:#b7b7bc;font-size:13px;font-weight:700}
  .dot{color:#55555b}
  .level{display:flex;align-items:center;gap:6px;margin-top:9px;font-size:13px;font-weight:950;letter-spacing:.04em}
  .level.elevate{color:#d59b21}.level.ascend{color:#a84df5}.level.air{color:#00bed0}.level.select{color:#fff}
  .levelMark{font-size:18px;line-height:1}

  .seasonButton{width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid #27272c;border-radius:11px;background:#080809;color:#e8e8ea;padding:13px 14px;margin:0 0 14px;font-size:12px;font-weight:900;letter-spacing:.08em;cursor:pointer}
  .trackButton{width:100%;min-height:60px;border:1px solid #8d3bd0;border-radius:10px;background:linear-gradient(105deg,#46136f,#7024ad 52%,#4a176f);color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:950;letter-spacing:.04em;cursor:pointer;box-shadow:0 12px 28px rgba(112,36,173,.2)}
  .trackButton:active{transform:scale(.99);filter:brightness(1.14)}
  .trackButton.resume{margin-top:16px}.plus{font-size:22px;font-weight:400}
  .accessLine{text-align:center;color:#77777d;font-size:10px;font-weight:800;letter-spacing:.12em;padding:10px 0 16px}

  .liveGameCard,.sectionCard,.pathCard{border:1px solid #29292e;border-radius:13px;background:linear-gradient(180deg,#0d0d0f,#080809);padding:15px;margin-bottom:13px}
  .liveGameCard{border-color:#3c3046;box-shadow:inset 0 0 0 1px rgba(126,45,176,.08)}
  .liveTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.liveLabel{display:flex;align-items:center;gap:7px;color:#c8c8cc;font-size:9px;font-weight:900;letter-spacing:.15em}.liveDot{width:8px;height:8px;border-radius:50%;background:#19d84b;box-shadow:0 0 10px rgba(25,216,75,.55)}
  .liveOpponent{font-size:21px;font-weight:950;margin-top:7px}.autoSave{color:#7f7f85;font-size:9px;font-weight:900;letter-spacing:.08em;white-space:nowrap}
  .liveStats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:15px}.miniStat{border:1px solid #28282d;border-radius:10px;background:#09090a;padding:10px}.miniLabel{color:#77777e;font-size:8px;font-weight:900;letter-spacing:.12em}.miniValue{font-size:20px;font-weight:950;margin-top:5px}.shootingLine{display:flex;flex-wrap:wrap;gap:6px;color:#9a9aa0;font-size:11px;margin-top:11px}

  .sectionHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:13px;color:#e9e9eb;font-size:10px;font-weight:950;letter-spacing:.12em}.sectionMeta{color:#77777d;font-size:9px}
  .seasonGrid{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #242429;border-bottom:1px solid #242429}.seasonStat{text-align:left;padding:13px 8px;border-right:1px solid #242429}.seasonStat:last-child{border-right:0}.seasonValue{font-size:21px;font-weight:950}.seasonLabel{margin-top:4px;color:#88888e;font-size:9px;font-weight:800;letter-spacing:.05em}.dataPending{padding-top:10px;color:#68686e;font-size:10px;line-height:1.45}

  .trendLive{display:grid;grid-template-columns:auto 1fr auto;align-items:end;gap:12px}.trendValue{font-size:30px;font-weight:950}.trendLabel{color:#8d8d93;font-size:9px;font-weight:800;letter-spacing:.08em}.sparkline{height:55px;display:flex;align-items:flex-end;justify-content:center;gap:5px;padding:0 3px 2px}.sparkline span{position:relative;display:block;width:16%;min-width:8px;max-width:18px;border-radius:4px 4px 1px 1px;background:linear-gradient(180deg,#a34eea,#5b1f86);box-shadow:0 0 10px rgba(150,65,220,.22)}.sparkline i{position:absolute;top:-13px;left:50%;transform:translateX(-50%);color:#85858b;font-size:7px;font-style:normal;font-weight:800}.trendCompare{text-align:right}.trendCompare strong{display:block;color:#9e45e8;font-size:18px}.trendCompare.up strong{color:#48d76c}.trendCompare.down strong{color:#ff6262}.trendCompare span{display:block;color:#77777d;font-size:8px;font-weight:800;letter-spacing:.08em;margin-top:4px}
  .emptyGame{border:1px dashed #2d2d32;border-radius:10px;padding:17px;color:#7f7f85;font-size:12px;line-height:1.5}
  .lastGameCard{border:1px solid #29292e;border-radius:11px;background:#080809;padding:12px}.lastGameTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.lastOpponent{font-size:18px;font-weight:950}.lastDate{margin-top:4px;color:#77777d;font-size:9px;font-weight:800;letter-spacing:.08em}.resultBadge{min-width:58px;border:1px solid #3b3b40;border-radius:9px;padding:7px 8px;text-align:center;color:#fff;font-size:18px;font-weight:950}.resultBadge span{display:block;margin-top:3px;color:#b9b9be;font-size:8px;font-weight:800}.resultBadge.w{border-color:#19863c;background:rgba(0,180,58,.12);color:#30e566}.resultBadge.l{border-color:#8b2424;background:rgba(210,20,20,.10);color:#ff5f5f}.resultBadge.t{border-color:#66666b;color:#d6d6d8}.lastStats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.lastGameMeta{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;color:#85858b;font-size:9px;font-weight:700}

  .pathLevels{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr auto;align-items:center;gap:8px;padding:2px 0 4px}.pathLine{height:1px;background:#38383d}

  .bottomNav{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,430px);height:76px;padding:7px 9px calc(7px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr 1.15fr 1fr 1fr;align-items:end;background:rgba(5,5,6,.96);backdrop-filter:blur(14px);border-top:1px solid #29292e;z-index:20}
  .navItem,.trackNav{border:0;background:transparent;color:#8b8b91;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:8px;font-weight:900;letter-spacing:.06em;cursor:pointer}.navItem.active{color:#a84df5}.navIcon{font-size:22px;line-height:1}.trackNav{align-self:center}.trackNav>span{width:45px;height:45px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7b2bb7,#4f176e);color:#fff;border:1px solid #9848d4;font-size:27px;box-shadow:0 0 18px rgba(121,43,182,.28)}.trackNav small{font-size:8px;color:#c9c9cd;font-weight:900;letter-spacing:.07em}

  @media (max-width:380px){.homePage{padding-left:11px;padding-right:11px}.avatar{width:78px;height:78px;flex-basis:78px}.playerName{font-size:25px}.playerMeta{font-size:12px}.seasonGrid{grid-template-columns:repeat(5,1fr)}.seasonStat{padding:12px 5px}.seasonValue{font-size:18px}.liveStats{gap:5px}.miniStat{padding:9px 7px}}
`;
