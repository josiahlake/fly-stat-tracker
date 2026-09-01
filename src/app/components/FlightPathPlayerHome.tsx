"use client";

import { useEffect, useState } from "react";
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

type Props = {
  playerId: string;
  onStartGame?: () => void;
};

export default function FlightPathPlayerHome({
  playerId,
  onStartGame,
}: Props) {
  const [data, setData] = useState<PlayerHomeData | null>(null);
  const [liveGame, setLiveGame] = useState<LiveGameDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlayerHome() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("Please sign in again.");
        }

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
            teams (
              display_name
            ),
            seasons (
              name
            )
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

        if (draft) {
          const fgMade =
            (draft.two_pt_made ?? 0) +
            (draft.three_pt_made ?? 0);

          const fgAttempts =
            fgMade +
            (draft.two_pt_missed ?? 0) +
            (draft.three_pt_missed ?? 0);

          const threeMade =
            draft.three_pt_made ?? 0;

          const threeAttempts =
            threeMade +
            (draft.three_pt_missed ?? 0);

          const ftMade =
            draft.ft_made ?? 0;

          const ftAttempts =
            ftMade +
            (draft.ft_missed ?? 0);

          setLiveGame({
            opponentName: draft.opponent_name || "Opponent",
            gameDate: draft.game_date || "",

            points:
              ((draft.two_pt_made ?? 0) * 2) +
              ((draft.three_pt_made ?? 0) * 3) +
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

          jerseyNumber:
            membership?.jersey_number ?? null,

          teamName:
            (
              membership?.teams as
                | { display_name?: string }
                | null
            )?.display_name ?? null,

          seasonName:
            (
              membership?.seasons as
                | { name?: string }
                | null
            )?.name ?? null,

          gamesTotal:
            entitlement?.games_total ?? 0,

          gamesUsed:
            entitlement?.games_used ?? 0,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Flight Path."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPlayerHome();
  }, [playerId]);

  if (loading) {
    return (
      <main className="fpStatePage">
        <div className="fpLoading">LOADING FLIGHT PATH...</div>

        <style>{stateStyles}</style>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="fpStatePage">
        <div className="fpErrorState">
          <strong>Unable to load player.</strong>
          <span>{error}</span>
        </div>

        <style>{stateStyles}</style>
      </main>
    );
  }

  const gamesRemaining = Math.max(
    data.gamesTotal - data.gamesUsed,
    0
  );

  const playerName =
    `${data.firstName} ${data.lastName}`.trim();

  const jersey =
    data.jerseyNumber
      ? `#${data.jerseyNumber}`
      : "";

  return (
    <main className="homePage">
      <section className="phoneShell">

        {/* HEADER */}

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

        {/* PLAYER IDENTITY */}

        <section className="playerHero">
          <div className="avatar">
            <div className="avatarInner">
              {data.firstName
                ?.charAt(0)
                .toUpperCase()}
              {data.lastName
                ?.charAt(0)
                .toUpperCase()}
            </div>
          </div>

          <div className="playerIdentity">
            <div className="playerName">
              {playerName}
            </div>

            <div className="playerMeta">
              {jersey && (
                <span>{jersey}</span>
              )}

              {jersey && data.teamName && (
                <span className="dot">•</span>
              )}

              {data.teamName && (
                <span>{data.teamName}</span>
              )}
            </div>

            <div className="level">
              ASCEND
              <span className="levelMark">⌃</span>
            </div>
          </div>
        </section>

        {/* SEASON */}

        <button
          className="seasonButton"
          type="button"
        >
          <span>
            {data.seasonName ??
              "CURRENT SEASON"}
          </span>

          <span>⌄</span>
        </button>

        {/* PRIMARY GAME ACTION */}

        {liveGame ? (
          <section className="liveGameCard">
            <div className="liveTop">
              <div>
                <div className="liveLabel">
                  <span className="liveDot" />
                  GAME IN PROGRESS
                </div>

                <div className="liveOpponent">
                  vs. {liveGame.opponentName}
                </div>
              </div>

              <div className="autoSave">
                AUTO-SAVED ✓
              </div>
            </div>

            <div className="liveStats">
              <Stat
                label="PTS"
                value={liveGame.points}
              />

              <Stat
                label="REB"
                value={liveGame.rebounds}
              />

              <Stat
                label="AST"
                value={liveGame.assists}
              />

              <Stat
                label="STL"
                value={liveGame.steals}
              />
            </div>

            <div className="shootingLine">
              FG {liveGame.fieldGoalsMade}-
              {liveGame.fieldGoalsAttempted}
              <span>•</span>
              3PT {liveGame.threePointersMade}-
              {liveGame.threePointersAttempted}
              <span>•</span>
              FT {liveGame.freeThrowsMade}-
              {liveGame.freeThrowsAttempted}
            </div>

            <button
              type="button"
              className="trackButton resume"
              onClick={onStartGame}
            >
              RESUME GAME
              <span>→</span>
            </button>
          </section>
        ) : (
          <>
            <button
              type="button"
              className="trackButton"
              onClick={onStartGame}
            >
              <span className="plus">＋</span>
              TRACK A GAME
            </button>

            <div className="accessLine">
              {gamesRemaining === 1
                ? "1 GAME REMAINING"
                : `${gamesRemaining} GAMES REMAINING`}
            </div>
          </>
        )}

        {/* SEASON STATS */}

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>SEASON STATS</span>

            <span className="sectionMeta">
              {data.seasonName ?? "CURRENT"}
            </span>
          </div>

          <div className="seasonGrid">
            <SeasonStat
              value="—"
              label="PPG"
            />

            <SeasonStat
              value="—"
              label="RPG"
            />

            <SeasonStat
              value="—"
              label="APG"
            />

            <SeasonStat
              value="—"
              label="STL"
            />

            <SeasonStat
              value="—"
              label="FG%"
            />
          </div>

          <div className="dataPending">
            Season stats will populate from
            completed games.
          </div>
        </section>

        {/* LAST 5 */}

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>LAST 5 GAMES</span>
          </div>

          <div className="trendEmpty">
            <div>
              <div className="trendValue">—</div>
              <div className="trendLabel">
                PPG
              </div>
            </div>

            <div className="trendGraphic">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="trendCompare">
              <strong>—</strong>
              <span>VS SEASON</span>
            </div>
          </div>
        </section>

        {/* LAST GAME */}

        <section className="sectionCard">
          <div className="sectionHeader">
            <span>LAST GAME</span>
          </div>

          <div className="emptyGame">
            Complete your first game to begin
            building your Flight Path.
          </div>
        </section>

        {/* FLIGHT PATH */}

        <section className="pathCard">
          <div className="sectionHeader">
            <span>YOUR FLIGHT PATH</span>
          </div>

          <div className="pathLevels">
            <PathLevel
              icon="⌃"
              name="ELEVATE"
              className="elevate"
            />

            <div className="pathLine" />

            <PathLevel
              icon="⌃"
              name="ASCEND"
              className="ascend active"
            />

            <div className="pathLine" />

            <PathLevel
              icon="➤"
              name="AIR"
              className="air"
            />

            <div className="pathLine" />

            <PathLevel
              icon="☆"
              name="SELECT"
              className="select"
            />
          </div>
        </section>

        {/* BOTTOM NAV */}

        <nav className="bottomNav">
          <NavItem
            icon="⌂"
            label="HOME"
            active
          />

          <NavItem
            icon="▣"
            label="LOG"
          />

          <button
            type="button"
            className="trackNav"
            onClick={onStartGame}
          >
            <span>＋</span>
            <small>TRACK</small>
          </button>

          <NavItem
            icon="➤"
            label="PATH"
          />

          <NavItem
            icon="♙"
            label="PLAYER"
          />
        </nav>
      </section>

      <style>{`
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
        }

        .homePage {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 50% -10%,
              #171717 0%,
              #060606 28%,
              #000 58%
            );
          color: white;
          padding:
            max(18px, env(safe-area-inset-top))
            14px
            calc(
              96px +
              env(safe-area-inset-bottom)
            );
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

        .topBar {
          min-height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 16px;
          font-weight: 950;
          font-style: italic;
          letter-spacing: -0.02em;
        }

        .plane {
          display: inline-block;
          color: #d59b21;
          font-size: 19px;
          transform: rotate(-26deg);
        }

        .iconButton {
          width: 46px;
          height: 46px;
          border: none;
          background: transparent;
          color: white;
          font-size: 26px;
          cursor: pointer;
        }

        .playerHero {
          display: flex;
          align-items: center;
          gap: 17px;
          padding: 17px 0 20px;
        }

        .avatar {
          width: 86px;
          height: 86px;
          flex: 0 0 86px;
          padding: 2px;
          border-radius: 50%;
          background:
            linear-gradient(
              145deg,
              #a34eea,
              #582082,
              #d59b21
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
              circle at 50% 35%,
              #26262b,
              #0b0b0d 70%
            );
          color: white;
          font-size: 27px;
          font-weight: 950;
        }

        .playerIdentity {
          min-width: 0;
        }

        .playerName {
          color: #fff;
          font-size: 28px;
          line-height: 1;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: -0.035em;
        }

        .playerMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 9px;
          color: #b3b3b8;
          font-size: 13px;
          font-weight: 700;
        }

        .dot {
          color: #55555b;
        }

        .level {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 8px;
          color: #a84df5;
          font-size: 13px;
          font-weight: 950;
          letter-spacing:
