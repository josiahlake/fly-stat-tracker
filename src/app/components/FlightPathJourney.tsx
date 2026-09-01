"use client";

import { useEffect, useMemo, useState } from "react";
import FlightLevelMark from "./FlightLevelMark";
import { supabase } from "../lib/supabase";

type Tab = "season" | "career" | "levels";

type Props = {
  playerId: string;
  onHome: () => void;
  onOpenLog: () => void;
  onTrackGame: () => void;
  onOpenPlayer: () => void;
};

type Membership = {
  id: string;
  jerseyNumber: string | null;
  teamName: string | null;
  seasonName: string | null;
  createdAt: string;
  level: "elevate" | "ascend" | "air" | "select";
};

type Game = {
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
  playingSeconds: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
};

type Player = {
  firstName: string;
  lastName: string;
};

function extractLevel(teamName: string | null): Membership["level"] {
  const match = teamName?.match(/\[([^\]]+)\]/)?.[1]?.toLowerCase() ?? "";

  if (match.includes("elevate")) return "elevate";
  if (match.includes("air")) return "air";
  if (match.includes("select")) return "select";
  return "ascend";
}

function pct(made: number, attempts: number) {
  return attempts ? (made / attempts) * 100 : 0;
}

function avg(total: number, count: number) {
  return count ? total / count : 0;
}

function prettyDate(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;

  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

function levelLabel(level: Membership["level"]) {
  return level.toUpperCase();
}

function levelDescriptor(level: Membership["level"]) {
  if (level === "elevate") return "DEVELOP TO PLAY";
  if (level === "ascend") return "PLAY TO COMPETE";
  if (level === "air") return "COMPETE TO DOMINATE";
  return "COMPETE BEYOND";
}

function Metric({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function NavIcon({
  type,
}: {
  type: "home" | "log" | "path" | "player";
}) {
  if (type === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 11.2 12 4l9 7.2V21h-6v-6H9v6H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "log") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 3h6v4H9zM9 11h6M9 15h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "path") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 12 18-8-7 17-3-7-8-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 21c.6-4.3 3-6.5 7.5-6.5s6.9 2.2 7.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function FlightPathJourney({
  playerId,
  onHome,
  onOpenLog,
  onTrackGame,
  onOpenPlayer,
}: Props) {
  const [tab, setTab] = useState<Tab>("season");
  const [player, setPlayer] = useState<Player | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data: playerRow, error: playerError } = await supabase
          .from("flight_players")
          .select("first_name,last_name")
          .eq("id", playerId)
          .single();

        if (playerError) throw playerError;

        const { data: membershipRows, error: membershipError } = await supabase
          .from("flight_team_memberships")
          .select(`
            id,
            jersey_number,
            created_at,
            teams (display_name),
            seasons (name)
          `)
          .eq("player_id", playerId)
          .order("created_at", { ascending: true });

        if (membershipError) throw membershipError;

        const { data: gameRows, error: gameError } = await supabase
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
          .limit(200);

        if (gameError) throw gameError;

        let mergedGames: Game[] = [];

        if (gameRows && gameRows.length > 0) {
          const ids = gameRows.map((game) => game.id);

          const { data: statRows, error: statError } = await supabase
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
              playing_seconds
            `)
            .in("game_id", ids);

          if (statError) throw statError;

          const statsByGame = new Map(
            (statRows ?? []).map((row) => [row.game_id, row])
          );

          mergedGames = gameRows.map((game) => {
            const stat = statsByGame.get(game.id) as any;

            const twoMade = stat?.two_pt_made ?? 0;
            const twoMissed = stat?.two_pt_missed ?? 0;
            const threeMade = stat?.three_pt_made ?? 0;
            const threeMissed = stat?.three_pt_missed ?? 0;
            const ftMade = stat?.ft_made ?? 0;
            const ftMissed = stat?.ft_missed ?? 0;

            const fgMade = twoMade + threeMade;
            const fgAttempts =
              fgMade +
              twoMissed +
              threeMissed;

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

        const mappedMemberships: Membership[] = (membershipRows ?? []).map(
          (row: any) => {
            const teamName = row?.teams?.display_name ?? null;

            return {
              id: row.id,
              jerseyNumber: row.jersey_number ?? null,
              teamName,
              seasonName: row?.seasons?.name ?? null,
              createdAt: row.created_at ?? "",
              level: extractLevel(teamName),
            };
          }
        );

        if (cancelled) return;

        setPlayer({
          firstName: playerRow.first_name,
          lastName: playerRow.last_name,
        });

        setMemberships(mappedMemberships);
        setGames(mergedGames);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load Flight Path."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const currentMembership =
    memberships[memberships.length - 1] ?? null;

  const summary = useMemo(() => {
    const count = games.length;

    const totals = games.reduce(
      (acc, game) => {
        acc.points += game.points;
        acc.rebounds += game.rebounds;
        acc.assists += game.assists;
        acc.steals += game.steals;
        acc.turnovers += game.turnovers;
        acc.blocks += game.blocks;
        acc.playingSeconds += game.playingSeconds;
        acc.fgm += game.fieldGoalsMade;
        acc.fga += game.fieldGoalsAttempted;
        acc.threeMade += game.threePointersMade;
        acc.threeAttempts += game.threePointersAttempted;
        acc.ftMade += game.freeThrowsMade;
        acc.ftAttempts += game.freeThrowsAttempted;
        return acc;
      },
      {
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        turnovers: 0,
        blocks: 0,
        playingSeconds: 0,
        fgm: 0,
        fga: 0,
        threeMade: 0,
        threeAttempts: 0,
        ftMade: 0,
        ftAttempts: 0,
      }
    );

    const wins = games.filter((game) => game.result === "W").length;
    const losses = games.filter((game) => game.result === "L").length;

    return {
      games: count,
      wins,
      losses,
      ppg: avg(totals.points, count),
      rpg: avg(totals.rebounds, count),
      apg: avg(totals.assists, count),
      spg: avg(totals.steals, count),
      topg: avg(totals.turnovers, count),
      mpg: avg(totals.playingSeconds, count) / 60,
      fgPct: pct(totals.fgm, totals.fga),
      threePct: pct(totals.threeMade, totals.threeAttempts),
      ftPct: pct(totals.ftMade, totals.ftAttempts),
    };
  }, [games]);

  const lastFive = useMemo(() => games.slice(0, 5), [games]);

  const lastFivePpg = useMemo(
    () =>
      lastFive.length
        ? lastFive.reduce((sum, game) => sum + game.points, 0) /
          lastFive.length
        : 0,
    [lastFive]
  );

  const highs = useMemo(() => {
    const maxGame = (key: keyof Pick<
      Game,
      "points" | "rebounds" | "assists" | "steals" | "blocks"
    >) =>
      games.reduce<Game | null>(
        (best, game) =>
          !best || game[key] > best[key] ? game : best,
        null
      );

    return [
      ["POINTS", maxGame("points"), "points"],
      ["REBOUNDS", maxGame("rebounds"), "rebounds"],
      ["ASSISTS", maxGame("assists"), "assists"],
      ["STEALS", maxGame("steals"), "steals"],
      ["BLOCKS", maxGame("blocks"), "blocks"],
    ] as const;
  }, [games]);

  if (loading) {
    return (
      <main className="statePage">
        LOADING FLIGHT PATH...
        <style>{styles}</style>
      </main>
    );
  }

  if (error || !player) {
    return (
      <main className="statePage">
        <strong>WE COULDN&apos;T LOAD FLIGHT PATH.</strong>
        <span>{error}</span>
        <button type="button" onClick={onHome}>
          RETURN HOME
        </button>
        <style>{styles}</style>
      </main>
    );
  }

  const fullName =
    `${player.firstName} ${player.lastName}`.trim();

  const lastFiveDelta =
    lastFive.length ? lastFivePpg - summary.ppg : 0;

  return (
    <main className="journeyPage">
      <section className="phoneShell">
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
            <div className="academy">THE FLY ACADEMY</div>

            <div className="wordmarkRow">
              <div className="wordmark">FLIGHT PATH</div>

              <div className="brandPlane">
                <svg viewBox="0 0 64 64" aria-hidden="true">
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
              TRACK <span>YOUR</span> GAME. SEE <span>YOUR</span> JOURNEY.
            </div>
          </div>

          <div className="headerSpacer" />
        </header>

        <section className="playerLine">
          <div className="playerText">
            <span>PLAYER</span>
            <strong>{fullName}</strong>
          </div>

          {currentMembership ? (
            <FlightLevelMark
              level={currentMembership.level}
              showName
              size="sm"
            />
          ) : null}
        </section>

        <section className="tabs">
          {(["season", "career", "levels"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </section>

        {tab === "season" ? (
          <>
            <section className="seasonIdentity card">
              <div className="seasonIdentityLeft">
                {currentMembership ? (
                  <FlightLevelMark
                    level={currentMembership.level}
                    showName
                    size="md"
                  />
                ) : null}

                <div>
                  <strong>
                    {currentMembership?.teamName?.replace(
                      /\s*\[[^\]]+\]\s*/,
                      ""
                    ) || "FLY ACADEMY"}
                  </strong>
                  <span>
                    {currentMembership?.seasonName || "CURRENT SEASON"}
                  </span>
                </div>
              </div>

              <div className="recordBlock">
                <div>
                  <strong>{summary.games}</strong>
                  <span>GAMES</span>
                </div>

                <div>
                  <strong>
                    <i>{summary.wins}</i> - {summary.losses}
                  </strong>
                  <span>W - L</span>
                </div>
              </div>
            </section>

            <section className="metricsCard card">
              <div className="metricsGrid topMetrics">
                <Metric value={summary.ppg.toFixed(1)} label="PPG" />
                <Metric value={summary.rpg.toFixed(1)} label="RPG" />
                <Metric value={summary.apg.toFixed(1)} label="APG" />
                <Metric value={summary.spg.toFixed(1)} label="SPG" />
                <Metric value={summary.topg.toFixed(1)} label="TOPG" />
              </div>

              <div className="metricsGrid bottomMetrics">
                <Metric value={`${summary.fgPct.toFixed(1)}%`} label="FG%" />
                <Metric value={`${summary.threePct.toFixed(1)}%`} label="3PT%" />
                <Metric value={`${summary.ftPct.toFixed(1)}%`} label="FT%" />
                <Metric value={summary.mpg.toFixed(1)} label="MPG" />
              </div>
            </section>

            <section className="trendCard card">
              <div className="sectionTitle">
                LAST 5 GAMES VS SEASON AVERAGE
              </div>

              <div className="trendLayout">
                <div className="trendSummary">
                  <span>PPG LAST 5</span>
                  <strong>{lastFivePpg.toFixed(1)}</strong>
                  <span>SEASON AVG</span>
                  <b>{summary.ppg.toFixed(1)}</b>
                </div>

                <div className="bars">
                  {lastFive
                    .slice()
                    .reverse()
                    .map((game) => {
                      const max = Math.max(
                        ...lastFive.map((item) => item.points),
                        1
                      );

                      const height =
                        30 + (game.points / max) * 58;

                      return (
                        <div className="barItem" key={game.id}>
                          <i>{game.points}</i>
                          <span style={{ height: `${height}px` }} />
                          <small>{prettyDate(game.gameDate)}</small>
                        </div>
                      );
                    })}
                </div>

                <div
                  className={`delta ${
                    lastFiveDelta >= 0 ? "positive" : "negative"
                  }`}
                >
                  <strong>
                    {lastFiveDelta >= 0 ? "+" : ""}
                    {lastFiveDelta.toFixed(1)}
                  </strong>
                  <span>VS SEASON</span>
                  <span>AVERAGE</span>
                </div>
              </div>
            </section>

            <section className="highsCard card">
              <div className="sectionTitle">SEASON HIGHS</div>

              <div className="highsGrid">
                {highs.map(([label, game, key]) => (
                  <div className="highItem" key={label}>
                    <strong>{game ? game[key] : 0}</strong>
                    <span>{label}</span>
                    <small>
                      {game ? `vs. ${game.opponentName}` : "—"}
                    </small>
                    <small>{game ? prettyDate(game.gameDate) : ""}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="timelineCard card">
              <div className="sectionTitle">YOUR FLIGHT PATH</div>
              <p>Every season is part of the journey.</p>

              {memberships.length ? (
                <div className="timelineScroll">
                  <div className="timeline">
                    {memberships.map((membership, index) => (
                      <div className="timelineStop" key={membership.id}>
                        <div className="seasonName">
                          {membership.seasonName || `SEASON ${index + 1}`}
                        </div>

                        <FlightLevelMark
                          level={membership.level}
                          showName
                          size="sm"
                        />

                        <div className="teamName">
                          {membership.teamName?.replace(
                            /\s*\[[^\]]+\]\s*/,
                            ""
                          ) || "FLY"}
                        </div>

                        {index < memberships.length - 1 ? (
                          <div className="timelineArrow">→</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty">
                  Your season history will appear here as memberships are added.
                </div>
              )}
            </section>
          </>
        ) : null}

        {tab === "career" ? (
          <>
            <section className="careerHero card">
              <div className="sectionTitle">CAREER SNAPSHOT</div>
              <strong>{summary.games}</strong>
              <span>TRACKED GAMES</span>
            </section>

            <section className="metricsCard card">
              <div className="metricsGrid topMetrics">
                <Metric value={summary.ppg.toFixed(1)} label="PPG" />
                <Metric value={summary.rpg.toFixed(1)} label="RPG" />
                <Metric value={summary.apg.toFixed(1)} label="APG" />
                <Metric value={summary.spg.toFixed(1)} label="SPG" />
                <Metric value={`${summary.fgPct.toFixed(1)}%`} label="FG%" />
              </div>
            </section>

            <section className="timelineCard card">
              <div className="sectionTitle">CAREER JOURNEY</div>
              <p>
                The path can move forward, back, or sideways from season to season.
              </p>

              <div className="timelineScroll">
                <div className="timeline">
                  {memberships.map((membership, index) => (
                    <div className="timelineStop" key={membership.id}>
                      <div className="seasonName">
                        {membership.seasonName || `SEASON ${index + 1}`}
                      </div>

                      <FlightLevelMark
                        level={membership.level}
                        showName
                        size="sm"
                      />

                      <div className="teamName">
                        {membership.teamName?.replace(
                          /\s*\[[^\]]+\]\s*/,
                          ""
                        ) || "FLY"}
                      </div>

                      {index < memberships.length - 1 ? (
                        <div className="timelineArrow">→</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}

        {tab === "levels" ? (
          <section className="levelsCard card">
            <div className="sectionTitle">FLIGHT LEVELS</div>
            <p>
              Levels describe the competitive environment for that season — not a permanent ranking.
            </p>

            {(["elevate", "ascend", "air", "select"] as Membership["level"][]).map(
              (level) => (
                <div className="levelRow" key={level}>
                  <FlightLevelMark
                    level={level}
                    showName
                    size="md"
                  />

                  <div>
                    <strong>{levelLabel(level)}</strong>
                    <span>{levelDescriptor(level)}</span>
                  </div>
                </div>
              )
            )}
          </section>
        ) : null}

        <nav className="bottomNav">
          <button type="button" className="navItem" onClick={onHome}>
            <span className="navIcon"><NavIcon type="home" /></span>
            <small>HOME</small>
          </button>

          <button type="button" className="navItem" onClick={onOpenLog}>
            <span className="navIcon"><NavIcon type="log" /></span>
            <small>LOG</small>
          </button>

          <button type="button" className="trackNav" onClick={onTrackGame}>
            <span>＋</span>
            <small>TRACK</small>
          </button>

          <button type="button" className="navItem active">
            <span className="navIcon"><NavIcon type="path" /></span>
            <small>PATH</small>
          </button>

          <button type="button" className="navItem" onClick={onOpenPlayer}>
            <span className="navIcon"><NavIcon type="player" /></span>
            <small>PLAYER</small>
          </button>
        </nav>
      </section>

      <style>{styles}</style>
    </main>
  );
}

const styles = `
  *{box-sizing:border-box}
  html,body{margin:0;background:#000}
  button{font:inherit;-webkit-tap-highlight-color:transparent}
  .statePage{min-height:100vh;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:Arial,Helvetica,sans-serif}
  .statePage span{color:#888;font-size:12px}.statePage button{min-height:46px;padding:0 18px;border:1px solid #8f36df;border-radius:8px;background:#401261;color:#fff;font-weight:900}

  .journeyPage{min-height:100vh;background:radial-gradient(circle at 50% -10%,#181818 0%,#070707 30%,#000 62%);color:#fff;padding:max(18px,env(safe-area-inset-top)) 14px calc(104px + env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}
  .phoneShell{width:100%;max-width:430px;margin:0 auto}
  .brandHeader{display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:start;padding:6px 0 20px}
  .backButton{width:42px;height:42px;border:0;background:transparent;color:#fff;font-size:38px;line-height:1;text-align:left;cursor:pointer}.headerSpacer{width:42px}
  .brandCenter{text-align:center}.academy{color:#9d9da2;font-size:10px;font-weight:850;letter-spacing:.25em;margin-bottom:9px}
  .wordmarkRow{display:flex;justify-content:center;align-items:center;gap:7px}.wordmark{font-size:clamp(35px,10vw,47px);line-height:.92;font-weight:1000;font-style:italic;letter-spacing:-.055em;white-space:nowrap}
  .brandPlane{width:36px;height:36px;flex:0 0 36px;color:#e5a719;transform:rotate(-7deg)}.brandPlane svg{width:100%;height:100%}
  .tagline{margin-top:14px;color:#f3f3f4;font-size:11px;line-height:1.4;font-weight:950;letter-spacing:.105em}.tagline span{color:#e5a719}

  .playerLine{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 0;border-top:1px solid #242429}.playerText{display:flex;flex-direction:column;gap:5px}.playerText span{color:#77777d;font-size:9px;font-weight:900;letter-spacing:.13em}.playerText strong{font-size:19px;text-transform:uppercase}
  .tabs{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #35353a;border-radius:11px;overflow:hidden;background:#050506;margin-bottom:14px}.tabs button{min-height:48px;border:0;border-right:1px solid #29292e;background:transparent;color:#99999f;font-size:11px;font-weight:950;letter-spacing:.08em;cursor:pointer}.tabs button:last-child{border-right:0}.tabs button.active{color:#e5a719;background:linear-gradient(180deg,rgba(229,167,25,.13),rgba(229,167,25,.03));box-shadow:inset 0 -2px 0 #e5a719}

  .card{border:1px solid #303035;border-radius:14px;background:linear-gradient(180deg,#0d0d0f,#070708);padding:15px;margin-bottom:13px}
  .sectionTitle{font-size:11px;font-weight:950;letter-spacing:.09em}.card p{color:#8e8e94;font-size:11px;line-height:1.5;margin:8px 0 15px}

  .seasonIdentity{display:flex;align-items:center;justify-content:space-between;gap:12px}.seasonIdentityLeft{display:flex;align-items:center;gap:12px;min-width:0}.seasonIdentityLeft>div:last-child{display:flex;flex-direction:column;gap:5px;min-width:0}.seasonIdentityLeft strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.seasonIdentityLeft span{color:#95959b;font-size:10px}
  .recordBlock{display:grid;grid-template-columns:1fr 1fr;gap:0;border-left:1px solid #29292e}.recordBlock>div{min-width:68px;text-align:center;padding:4px 9px}.recordBlock>div+div{border-left:1px solid #29292e}.recordBlock strong{display:block;font-size:23px}.recordBlock strong i{color:#33d863;font-style:normal}.recordBlock span{display:block;margin-top:4px;color:#96969c;font-size:8px;font-weight:900;letter-spacing:.07em}

  .metricsCard{padding:0 15px}.metricsGrid{display:grid}.topMetrics{grid-template-columns:repeat(5,1fr)}.bottomMetrics{grid-template-columns:repeat(4,1fr);border-top:1px solid #29292e}.metric{text-align:center;padding:15px 5px;border-right:1px solid #29292e}.metric:last-child{border-right:0}.metric strong{display:block;font-size:20px}.metric span{display:block;margin-top:5px;color:#98989e;font-size:8px;font-weight:900;letter-spacing:.06em}

  .trendLayout{display:grid;grid-template-columns:74px 1fr 76px;gap:10px;align-items:end;margin-top:15px}.trendSummary{display:flex;flex-direction:column}.trendSummary span{color:#8c8c92;font-size:8px;font-weight:900;letter-spacing:.06em}.trendSummary strong{font-size:26px;margin:4px 0 10px}.trendSummary b{font-size:17px;margin-top:4px}
  .bars{height:112px;display:flex;align-items:flex-end;justify-content:center;gap:7px;border-bottom:1px solid #39393e}.barItem{position:relative;width:18%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}.barItem i{font-size:9px;font-style:normal;font-weight:900;margin-bottom:4px}.barItem span{width:100%;max-width:24px;background:linear-gradient(180deg,#e5b74d,#8f6414);border-radius:2px 2px 0 0}.barItem small{position:absolute;bottom:-16px;color:#8c8c92;font-size:7px;white-space:nowrap}.delta{text-align:right;padding-bottom:13px}.delta strong{display:block;font-size:25px}.delta span{display:block;color:#8d8d93;font-size:8px;font-weight:900;margin-top:4px}.delta.positive strong{color:#45d864}.delta.negative strong{color:#ff5e64}

  .highsGrid{display:grid;grid-template-columns:repeat(5,1fr);margin-top:15px}.highItem{text-align:center;padding:3px 6px;border-right:1px solid #29292e}.highItem:last-child{border-right:0}.highItem strong{display:block;color:#e5a719;font-size:21px}.highItem span{display:block;margin-top:5px;font-size:8px;font-weight:950}.highItem small{display:block;margin-top:5px;color:#8f8f95;font-size:7px;line-height:1.25}

  .timelineScroll{overflow-x:auto;padding-bottom:4px}.timeline{display:flex;align-items:center;min-width:max-content;padding:8px 2px 3px}.timelineStop{position:relative;display:grid;grid-template-columns:auto 18px;align-items:center;gap:8px;padding-right:6px}.timelineStop:last-child{grid-template-columns:auto}.seasonName{grid-column:1;color:#a5a5aa;font-size:8px;font-weight:900;letter-spacing:.07em;margin-bottom:7px;text-align:center}.teamName{grid-column:1;color:#74747a;font-size:8px;text-align:center;margin-top:6px;max-width:92px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timelineArrow{grid-column:2;grid-row:2;color:#66666c;font-size:17px}.empty{border:1px dashed #333338;border-radius:10px;padding:16px;color:#7e7e84;font-size:11px;line-height:1.5}

  .careerHero{text-align:center;padding:22px}.careerHero .sectionTitle{text-align:left}.careerHero>strong{display:block;font-size:48px;margin-top:16px}.careerHero>span{color:#8f8f95;font-size:9px;font-weight:900;letter-spacing:.1em}

  .levelRow{display:grid;grid-template-columns:92px 1fr;gap:16px;align-items:center;padding:15px 0;border-top:1px solid #29292e}.levelRow:first-of-type{margin-top:8px}.levelRow>div:last-child{display:flex;flex-direction:column;gap:5px}.levelRow strong{font-size:14px}.levelRow span{color:#96969c;font-size:10px;font-weight:800;letter-spacing:.05em}

  .bottomNav{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,430px);height:78px;padding:7px 8px calc(7px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr 1.18fr 1fr 1fr;align-items:end;background:rgba(5,5,6,.97);backdrop-filter:blur(15px);border-top:1px solid #2d2d32;z-index:30}
  .navItem,.trackNav{border:0;background:transparent;color:#8a8a90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}.navItem.active{color:#e5a719}.navIcon{width:24px;height:24px;display:block}.navIcon svg{width:100%;height:100%}.navItem small,.trackNav small{font-size:8px;font-weight:950;letter-spacing:.05em}
  .trackNav{align-self:center;color:#d2d2d5}.trackNav>span{width:47px;height:47px;display:flex;align-items:center;justify-content:center;border:1px solid #b07a13;border-radius:50%;background:linear-gradient(135deg,#e5b74d,#9a6710);color:#050505;font-size:29px;line-height:1;box-shadow:0 0 19px rgba(229,167,25,.2)}

  @media(max-width:380px){
    .journeyPage{padding-left:9px;padding-right:9px}
    .brandHeader{grid-template-columns:35px minmax(0,1fr) 35px}.backButton,.headerSpacer{width:35px}.wordmark{font-size:35px}.brandPlane{width:30px;height:30px;flex-basis:30px}.tagline{font-size:10px;letter-spacing:.075em}
    .metric strong{font-size:17px}.metric span{font-size:7px}.trendLayout{grid-template-columns:66px 1fr 68px;gap:7px}.highItem{padding:3px}.highItem strong{font-size:18px}.highItem span{font-size:7px}
  }
`;
