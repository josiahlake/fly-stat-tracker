"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

type LiveCounts = {
  made2: number;
  miss2: number;
  made3: number;
  miss3: number;
  madeFT: number;
  missFT: number;
  orb: number;
  drb: number;
  ast: number;
  to: number;
  stl: number;
  pf: number;
};

type Action =
  | {
      kind: "inc";
      key: keyof LiveCounts;
    }
  | {
      kind: "dec";
      key: keyof LiveCounts;
    }
  | {
      kind: "reset";
    };

type PlayerContext = {
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  teamName: string | null;
  seasonName: string | null;
  membershipId: string | null;
};

type GameDraft = {
  updatedAt: number;
  date: string;
  opponent: string;
  notes: string;
  counts: LiveCounts;
};

type CompletedGame = {
  id: string;
  gameDate: string;
  opponentName: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
};

type GameTrackerProps = {
  playerId: string;
  onGameSaved?: () => void;
  onExitGame?: () => void;
};

const emptyCounts: LiveCounts = {
  made2: 0,
  miss2: 0,
  made3: 0,
  miss3: 0,
  madeFT: 0,
  missFT: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  to: 0,
  stl: 0,
  pf: 0,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();

  return `${d.getFullYear()}-${pad2(
    d.getMonth() + 1
  )}-${pad2(d.getDate())}`;
}

function clampNonNeg(n: number) {
  return Math.max(0, n);
}

function pct(made: number, attempts: number) {
  if (!attempts) return 0;
  return (made / attempts) * 100;
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="chip">
      <div className="chipLabel">{label}</div>
      <div className="chipValue">{value}</div>
    </div>
  );
}

function TapButton({
  id,
  activeId,
  onTap,
  title,
  sub,
  tone,
}: {
  id: string;
  activeId: string | null;
  onTap: () => void;
  title: string;
  sub: string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    "tapBtn " +
    (tone === "good"
      ? "tapBtnGood "
      : tone === "bad"
      ? "tapBtnBad "
      : "tapBtnNeutral ") +
    (activeId === id ? "tapBtnActive" : "");

  return (
    <button
      className={cls}
      onClick={onTap}
      type="button"
    >
      <div className="tapBtnTitle">{title}</div>
      <div className="tapBtnSub">{sub}</div>
    </button>
  );
}

export default function GameTracker({
  playerId,
  onGameSaved,
  onExitGame,
}: GameTrackerProps) {
  const [player, setPlayer] =
    useState<PlayerContext | null>(null);

  const [playerLoading, setPlayerLoading] =
    useState(true);

  const [playerError, setPlayerError] =
    useState("");

  const [counts, setCounts] =
    useState<LiveCounts>({ ...emptyCounts });

  const [date, setDate] =
    useState<string>(todayISO());

  const [opponent, setOpponent] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [history, setHistory] =
    useState<Action[]>([]);

  const [lastTapId, setLastTapId] =
    useState<string | null>(null);

  const [vibOn, setVibOn] =
    useState(true);

  const [draftReady, setDraftReady] =
    useState(false);

  const [saveState, setSaveState] =
    useState<
      | "idle"
      | "saving"
      | "saved"
      | "error"
    >("idle");

  const [finalizing, setFinalizing] =
    useState(false);

  const [completedGames, setCompletedGames] =
    useState<CompletedGame[]>([]);

  const draftTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const statusTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const DRAFT_KEY =
    `flightPath.gameDraft.${playerId}`;

  /*
   * -------------------------------------------------
   * LOAD PLAYER + CURRENT MEMBERSHIP
   * -------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerContext() {
      setPlayerLoading(true);
      setPlayerError("");

      try {
        const {
          data: playerRecord,
          error: playerRecordError,
        } = await supabase
          .from("flight_players")
          .select(
            "id, first_name, last_name"
          )
          .eq("id", playerId)
          .single();

        if (playerRecordError) {
          throw playerRecordError;
        }

        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from("flight_team_memberships")
          .select(`
            id,
            jersey_number,
            teams (
              display_name
            ),
            seasons (
              name
            )
          `)
          .eq("player_id", playerId)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          throw membershipError;
        }

        if (cancelled) return;

        setPlayer({
          firstName:
            playerRecord.first_name ?? "",
          lastName:
            playerRecord.last_name ?? "",
          jerseyNumber:
            membership?.jersey_number ?? null,
          membershipId:
            membership?.id ?? null,
          teamName:
            (
              membership?.teams as
                | {
                    display_name?: string;
                  }
                | null
            )?.display_name ?? null,
          seasonName:
            (
              membership?.seasons as
                | {
                    name?: string;
                  }
                | null
            )?.name ?? null,
        });
      } catch (error) {
        console.error(
          "Unable to load player context:",
          error
        );

        if (!cancelled) {
          setPlayerError(
            "Unable to load player information."
          );
        }
      } finally {
        if (!cancelled) {
          setPlayerLoading(false);
        }
      }
    }

    loadPlayerContext();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  /*
   * -------------------------------------------------
   * LOAD COMPLETED GAMES
   * -------------------------------------------------
   */

  async function loadCompletedGames() {
    try {
      const {
        data: games,
        error: gamesError,
      } = await supabase
        .from("flight_games")
        .select(`
          id,
          game_date,
          opponent_name,
          created_at
        `)
        .eq("player_id", playerId)
        .order("game_date", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      if (gamesError) throw gamesError;

      if (!games || games.length === 0) {
        setCompletedGames([]);
        return;
      }

      const gameIds = games.map(
        (game) => game.id
      );

      const {
        data: stats,
        error: statsError,
      } = await supabase
        .from("flight_game_stats")
        .select(`
          game_id,
          two_pt_made,
          three_pt_made,
          ft_made,
          rebounds,
          assists,
          steals
        `)
        .in("game_id", gameIds);

      if (statsError) throw statsError;

      const statsByGame = new Map(
        (stats ?? []).map((stat) => [
          stat.game_id,
          stat,
        ])
      );

      const merged: CompletedGame[] =
        games.map((game) => {
          const stat = statsByGame.get(
            game.id
          );

          return {
            id: game.id,
            gameDate: game.game_date,
            opponentName:
              game.opponent_name ||
              "Opponent",
            points:
              (stat?.two_pt_made ?? 0) *
                2 +
              (stat?.three_pt_made ?? 0) *
                3 +
              (stat?.ft_made ?? 0),
            rebounds:
              stat?.rebounds ?? 0,
            assists: stat?.assists ?? 0,
            steals: stat?.steals ?? 0,
          };
        });

      setCompletedGames(merged);
    } catch (error) {
      console.error(
        "Could not load completed games:",
        error
      );
    }
  }

  useEffect(() => {
    loadCompletedGames();
  }, [playerId]);

  /*
   * -------------------------------------------------
   * RESTORE UNFINISHED GAME
   * -------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          setDraftReady(true);
          return;
        }

        let localDraft:
          | GameDraft
          | null = null;

        try {
          if (
            typeof window !==
            "undefined"
          ) {
            const raw =
              localStorage.getItem(
                DRAFT_KEY
              );

            if (raw) {
              localDraft =
                JSON.parse(
                  raw
                ) as GameDraft;
            }
          }
        } catch (error) {
          console.error(
            "Could not read local draft:",
            error
          );
        }

        const {
          data: cloudDraft,
          error,
        } = await supabase
          .from("flight_game_drafts")
          .select("*")
          .eq("player_id", playerId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error(
            "Could not load cloud draft:",
            error
          );
        }

        if (cancelled) return;

        const cloudUpdatedAt =
          cloudDraft?.updated_at
            ? new Date(
                cloudDraft.updated_at
              ).getTime()
            : 0;

        const localUpdatedAt =
          localDraft?.updatedAt ?? 0;

        if (
          cloudDraft &&
          cloudUpdatedAt >=
            localUpdatedAt
        ) {
          setDate(
            cloudDraft.game_date ||
              todayISO()
          );

          setOpponent(
            cloudDraft.opponent_name ||
              ""
          );

          setNotes(
            cloudDraft.game_note || ""
          );

          setCounts({
            made2:
              cloudDraft.two_pt_made ??
              0,
            miss2:
              cloudDraft.two_pt_missed ??
              0,
            made3:
              cloudDraft.three_pt_made ??
              0,
            miss3:
              cloudDraft.three_pt_missed ??
              0,
            madeFT:
              cloudDraft.ft_made ?? 0,
            missFT:
              cloudDraft.ft_missed ?? 0,
            orb:
              cloudDraft.offensive_rebounds ??
              0,
            drb:
              cloudDraft.defensive_rebounds ??
              0,
            ast:
              cloudDraft.assists ?? 0,
            to:
              cloudDraft.turnovers ?? 0,
            stl:
              cloudDraft.steals ?? 0,
            pf:
              cloudDraft.fouls ?? 0,
          });
        } else if (localDraft) {
          setDate(
            localDraft.date ||
              todayISO()
          );

          setOpponent(
            localDraft.opponent || ""
          );

          setNotes(
            localDraft.notes || ""
          );

          setCounts({
            ...emptyCounts,
            ...localDraft.counts,
          });
        }
      } catch (error) {
        console.error(
          "Flight Path draft restore failed:",
          error
        );
      } finally {
        if (!cancelled) {
          setDraftReady(true);
        }
      }
    }

    restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [playerId, DRAFT_KEY]);

  /*
   * -------------------------------------------------
   * AUTOSAVE
   * -------------------------------------------------
   */

  useEffect(() => {
    if (!draftReady) return;

    const localDraft: GameDraft = {
      updatedAt: Date.now(),
      date,
      opponent,
      notes,
      counts: { ...counts },
    };

    try {
      if (
        typeof window !==
        "undefined"
      ) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(localDraft)
        );
      }
    } catch (error) {
      console.error(
        "Could not autosave local draft:",
        error
      );
    }

    setSaveState("saving");

    if (draftTimerRef.current) {
      clearTimeout(
        draftTimerRef.current
      );
    }

    draftTimerRef.current =
      setTimeout(async () => {
        try {
          const {
            data: { user },
          } =
            await supabase.auth.getUser();

          if (!user) return;

          const { error } =
            await supabase
              .from(
                "flight_game_drafts"
              )
              .upsert(
                {
                  player_id:
                    playerId,
                  user_id: user.id,
                  game_date:
                    date ||
                    todayISO(),
                  opponent_name:
                    opponent.trim(),
                  game_note:
                    notes.trim() ||
                    null,

                  two_pt_made:
                    counts.made2,
                  two_pt_missed:
                    counts.miss2,

                  three_pt_made:
                    counts.made3,
                  three_pt_missed:
                    counts.miss3,

                  ft_made:
                    counts.madeFT,
                  ft_missed:
                    counts.missFT,

                  offensive_rebounds:
                    counts.orb,
                  defensive_rebounds:
                    counts.drb,

                  assists:
                    counts.ast,
                  steals:
                    counts.stl,
                  turnovers:
                    counts.to,

                  blocks: 0,
                  fouls:
                    counts.pf,
                  playing_seconds: 0,
                },
                {
                  onConflict:
                    "player_id,user_id",
                }
              );

          if (error) {
            throw error;
          }

          setSaveState("saved");

          if (
            statusTimerRef.current
          ) {
            clearTimeout(
              statusTimerRef.current
            );
          }

          statusTimerRef.current =
            setTimeout(() => {
              setSaveState("idle");
            }, 1800);
        } catch (error) {
          console.error(
            "Flight Path autosave failed:",
            error
          );

          setSaveState("error");
        }
      }, 400);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(
          draftTimerRef.current
        );
      }
    };
  }, [
    draftReady,
    playerId,
    DRAFT_KEY,
    date,
    opponent,
    notes,
    counts,
  ]);

  /*
   * -------------------------------------------------
   * LIVE DERIVED STATS
   * -------------------------------------------------
   */

  const scoring = useMemo(() => {
    const fgm =
      counts.made2 +
      counts.made3;

    const fga =
      counts.made2 +
      counts.miss2 +
      counts.made3 +
      counts.miss3;

    const tpm = counts.made3;

    const tpa =
      counts.made3 +
      counts.miss3;

    const ftm =
      counts.madeFT;

    const fta =
      counts.madeFT +
      counts.missFT;

    const pts =
      counts.made2 * 2 +
      counts.made3 * 3 +
      counts.madeFT;

    return {
      pts,
      fgm,
      fga,
      fgPct: pct(fgm, fga),
      tpm,
      tpa,
      tpPct: pct(tpm, tpa),
      ftm,
      fta,
      ftPct: pct(ftm, fta),
    };
  }, [counts]);

  const ttlRebs =
    counts.orb + counts.drb;

  const season = useMemo(() => {
    const games =
      completedGames.length;

    const points =
      completedGames.reduce(
        (sum, game) =>
          sum + game.points,
        0
      );

    const rebounds =
      completedGames.reduce(
        (sum, game) =>
          sum + game.rebounds,
        0
      );

    const assists =
      completedGames.reduce(
        (sum, game) =>
          sum + game.assists,
        0
      );

    return {
      games,
      ppg: games
        ? points / games
        : 0,
      rpg: games
        ? rebounds / games
        : 0,
      apg: games
        ? assists / games
        : 0,
    };
  }, [completedGames]);

  /*
   * -------------------------------------------------
   * TAP FEEDBACK + STATS
   * -------------------------------------------------
   */

  function tapFeedback(id: string) {
    setLastTapId(id);

    window.setTimeout(() => {
      setLastTapId(null);
    }, 120);

    if (!vibOn) return;

    if (
      typeof navigator !==
        "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate(12);
    }
  }

  function inc(
    key: keyof LiveCounts,
    tapId: string
  ) {
    tapFeedback(tapId);

    setCounts((current) => ({
      ...current,
      [key]:
        current[key] + 1,
    }));

    setHistory((current) => [
      ...current,
      {
        kind: "inc",
        key,
      },
    ]);
  }

  function undo() {
    setHistory((current) => {
      if (!current.length) {
        return current;
      }

      const last =
        current[current.length - 1];

      setCounts((existing) => {
        if (
          last.kind === "inc"
        ) {
          return {
            ...existing,
            [last.key]: clampNonNeg(
              existing[last.key] - 1
            ),
          };
        }

        if (
          last.kind === "dec"
        ) {
          return {
            ...existing,
            [last.key]:
              existing[last.key] + 1,
          };
        }

        return existing;
      });

      return current.slice(0, -1);
    });
  }

  function describeAction(
    action: Action
  ) {
    if (action.kind === "inc") {
      return `+${String(
        action.key
      ).toUpperCase()}`;
    }

    if (action.kind === "dec") {
      return `-${String(
        action.key
      ).toUpperCase()}`;
    }

    return "RESET";
  }

  function confirmUndo() {
    if (!history.length) return;

    const last =
      history[
        history.length - 1
      ];

    const confirmed =
      window.confirm(
        `Undo last action: ${describeAction(
          last
        )}?\n\nThis will revert your most recent tap.`
      );

    if (confirmed) {
      undo();
    }
  }

  function resetLive() {
    setCounts({
      ...emptyCounts,
    });

    setHistory([]);
  }

  function confirmReset() {
    const hasStats =
      Object.values(
        counts
      ).some(
        (value) =>
          Number(value) > 0
      ) ||
      opponent.trim() !== "" ||
      notes.trim() !== "";

    if (!hasStats) return;

    const confirmed =
      window.confirm(
        "Clear this live game?\n\nThis will reset the current stats, opponent and notes."
      );

    if (!confirmed) {
      return;
    }

    setCounts({
      ...emptyCounts,
    });

    setOpponent("");
    setNotes("");
    setDate(todayISO());
    setHistory([]);
  }

  /*
   * -------------------------------------------------
   * MANUAL SAFETY SAVE
   * -------------------------------------------------
   */

  async function saveProgress() {
    try {
      setSaveState("saving");

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        alert(
          "Please sign in again."
        );
        return;
      }

      const localDraft: GameDraft = {
        updatedAt: Date.now(),
        date,
        opponent,
        notes,
        counts: {
          ...counts,
        },
      };

      if (
        typeof window !==
        "undefined"
      ) {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(localDraft)
        );
      }

      const { error } =
        await supabase
          .from(
            "flight_game_drafts"
          )
          .upsert(
            {
              player_id: playerId,
              user_id: user.id,

              game_date:
                date ||
                todayISO(),

              opponent_name:
                opponent.trim(),

              game_note:
                notes.trim() ||
                null,

              two_pt_made:
                counts.made2,
              two_pt_missed:
                counts.miss2,

              three_pt_made:
                counts.made3,
              three_pt_missed:
                counts.miss3,

              ft_made:
                counts.madeFT,
              ft_missed:
                counts.missFT,

              offensive_rebounds:
                counts.orb,
              defensive_rebounds:
                counts.drb,

              assists:
                counts.ast,
              steals:
                counts.stl,
              turnovers:
                counts.to,

              blocks: 0,
              fouls:
                counts.pf,

              playing_seconds: 0,
            },
            {
              onConflict:
                "player_id,user_id",
            }
          );

      if (error) {
        throw error;
      }

      setSaveState("saved");

      window.setTimeout(() => {
        setSaveState("idle");
      }, 1800);
    } catch (error) {
      console.error(
        "Could not save progress:",
        error
      );

      setSaveState("error");

      alert(
        "We couldn't save your progress to the cloud. Your latest stats should still be saved on this device."
      );
    }
  }

  /*
   * -------------------------------------------------
   * FINALIZE GAME
   * -------------------------------------------------
   */

  async function finalizeGame() {
    if (!player) {
      alert(
        "Player information is still loading."
      );
      return;
    }

    if (!player.membershipId) {
      alert(
        "We could not find this player's current team membership. Please return to Player Home and try again."
      );
      return;
    }

    const opponentName =
      opponent.trim();

    if (!opponentName) {
      alert(
        "Please enter the opponent before finalizing the game."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Finalize ${player.firstName} ${player.lastName}'s game vs. ${opponentName}?\n\nThis will publish the final stats to their Flight Path and close the live game.`
      );

    if (!confirmed) {
      return;
    }

    setFinalizing(true);

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "Please sign in again."
        );
      }

      /*
       * 1. Create completed game.
       */

      const {
        data: game,
        error: gameError,
      } = await supabase
        .from("flight_games")
        .insert({
          player_id: playerId,
          team_membership_id:
            player.membershipId,
          created_by: user.id,
          game_date:
            date || todayISO(),
          opponent_name:
            opponentName,
          game_note:
            notes.trim() ||
            null,
          completed_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (gameError) {
        throw gameError;
      }

      /*
       * 2. Create final stats.
       */

      const {
        error: statsError,
      } = await supabase
        .from("flight_game_stats")
        .insert({
          game_id: game.id,

          two_pt_made:
            counts.made2,
          two_pt_missed:
            counts.miss2,

          three_pt_made:
            counts.made3,
          three_pt_missed:
            counts.miss3,

          ft_made:
            counts.madeFT,
          ft_missed:
            counts.missFT,

          rebounds:
            counts.orb +
            counts.drb,

          assists:
            counts.ast,

          steals:
            counts.stl,

          turnovers:
            counts.to,

          blocks: 0,

          fouls:
            counts.pf,

          playing_seconds: 0,
        });

      if (statsError) {
        /*
         * Prevent an incomplete game
         * from remaining if stats fail.
         */

        await supabase
          .from("flight_games")
          .delete()
          .eq("id", game.id);

        throw statsError;
      }

      /*
       * 3. Delete unfinished cloud draft.
       */

      const {
        error: draftDeleteError,
      } = await supabase
        .from("flight_game_drafts")
        .delete()
        .eq("player_id", playerId)
        .eq("user_id", user.id);

      if (draftDeleteError) {
        console.error(
          "Completed game saved, but draft cleanup failed:",
          draftDeleteError
        );
      }

      /*
       * 4. Delete local draft.
       */

      if (
        typeof window !==
        "undefined"
      ) {
        localStorage.removeItem(
          DRAFT_KEY
        );
      }

      /*
       * 5. Clear local tracker state.
       */

      setCounts({
        ...emptyCounts,
      });

      setOpponent("");
      setNotes("");
      setHistory([]);
      setDate(todayISO());

      /*
       * 6. Return to Player Home.
       */

      if (onGameSaved) {
        onGameSaved();
      }
    } catch (error) {
      console.error(
        "Could not finalize game:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "We couldn't finalize the game. Your live game has not been intentionally cleared. Please try again."
      );
    } finally {
      setFinalizing(false);
    }
  }

  /*
   * -------------------------------------------------
   * LOADING / ERROR
   * -------------------------------------------------
   */

  if (playerLoading) {
    return (
      <main className="loadingPage">
        LOADING PLAYER...
      </main>
    );
  }

  if (
    playerError ||
    !player
  ) {
    return (
      <main className="loadingPage">
        <div
          style={{
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: "8px",
            }}
          >
            Unable to load player.
          </div>

          <div
            style={{
              color: "#777",
            }}
          >
            {playerError}
          </div>
        </div>
      </main>
    );
  }

  const fullName =
    `${player.firstName} ${player.lastName}`.trim();

  return (
    <div className="page">
      {/* TOP */}
      <div className="topBar">
        <div>
          <div className="kicker">
            FLIGHT PATH
          </div>

          <h1 className="title">
            Live Game Tracker
          </h1>

          <div className="subtitle">
            {fullName}
            {player.jerseyNumber
              ? ` · #${player.jerseyNumber}`
              : ""}
            {player.teamName
              ? ` · ${player.teamName}`
              : ""}
          </div>
        </div>

        <div className="topActions">
          {onExitGame && (
            <button
              className="ghostBtn"
              onClick={onExitGame}
              type="button"
            >
              PLAYER HOME
            </button>
          )}

          <button
            className="ghostBtn"
            onClick={() =>
              setVibOn(
                (current) =>
                  !current
              )
            }
            type="button"
          >
            Vib:{" "}
            {vibOn
              ? "On"
              : "Off"}
          </button>

          <button
            className="ghostBtn"
            onClick={confirmUndo}
            type="button"
            disabled={
              !history.length
            }
          >
            Undo
          </button>

          <button
            className="ghostBtn"
            onClick={confirmReset}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LIVE TRACKER */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">
                {fullName}
                {player.jerseyNumber
                  ? ` · #${player.jerseyNumber}`
                  : ""}
              </div>

              <div className="cardHint">
                {player.teamName ??
                  "Fly Academy"}
                {player.seasonName
                  ? ` · ${player.seasonName}`
                  : ""}
              </div>
            </div>

            <div className="saveControls">
              <div
                className={`saveStatus ${
                  saveState ===
                  "error"
                    ? "saveError"
                    : ""
                }`}
              >
                {saveState ===
                  "saving" &&
                  "SAVING..."}

                {saveState ===
                  "saved" &&
                  "SAVED ✓"}

                {saveState ===
                  "error" &&
                  "SAVE ISSUE"}

                {saveState ===
                  "idle" &&
                  "AUTO-SAVED ✓"}
              </div>

              <button
                className="ghostBtn"
                onClick={saveProgress}
                type="button"
              >
                SAVE PROGRESS
              </button>

              <button
                className="primaryBtn"
                onClick={
                  finalizeGame
                }
                type="button"
                disabled={
                  finalizing
                }
              >
                {finalizing
                  ? "FINALIZING..."
                  : "FINALIZE GAME →"}
              </button>
            </div>
          </div>

          <div className="formGrid">
            <div className="field">
              <div className="label">
                DATE
              </div>

              <input
                className="input"
                value={date}
                onChange={(e) =>
                  setDate(
                    e.target.value
                  )
                }
                type="date"
              />
            </div>

            <div className="field">
              <div className="label">
                OPPONENT
              </div>

              <input
                className="input"
                value={opponent}
                onChange={(e) =>
                  setOpponent(
                    e.target.value
                  )
                }
                placeholder="e.g., Tigard"
              />
            </div>
          </div>

          <div className="lockedPlayer">
            <div>
              <div className="label">
                PLAYER
              </div>

              <div className="lockedValue">
                {fullName}
                {player.jerseyNumber
                  ? ` · #${player.jerseyNumber}`
                  : ""}
              </div>
            </div>

            <div>
              <div className="label">
                TEAM
              </div>

              <div className="lockedValue">
                {player.teamName ??
                  "Fly Academy"}
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="statTilesWrap">
            <div className="statTilesRow">
              <StatChip
                label="PTS"
                value={scoring.pts}
              />

              <StatChip
                label="FG"
                value={`${scoring.fgm}-${scoring.fga}`}
              />

              <StatChip
                label="FG%"
                value={formatPct(
                  scoring.fgPct
                )}
              />

              <StatChip
                label="3P FG"
                value={`${scoring.tpm}-${scoring.tpa}`}
              />

              <StatChip
                label="3P FG%"
                value={formatPct(
                  scoring.tpPct
                )}
              />

              <StatChip
                label="FT"
                value={`${scoring.ftm}-${scoring.fta}`}
              />

              <StatChip
                label="FT%"
                value={formatPct(
                  scoring.ftPct
                )}
              />
            </div>

            <div className="statTilesRow statTilesRow2">
              <StatChip
                label="O REBS"
                value={counts.orb}
              />

              <StatChip
                label="D REBS"
                value={counts.drb}
              />

              <StatChip
                label="TTL REBS"
                value={ttlRebs}
              />

              <StatChip
                label="AST"
                value={counts.ast}
              />

              <StatChip
                label="TO"
                value={counts.to}
              />

              <StatChip
                label="STLS"
                value={counts.stl}
              />

              <StatChip
                label="FOULS"
                value={counts.pf}
              />
            </div>
          </div>

          {/* SCORING */}
          <div className="sectionLabel">
            SCORING
          </div>

          <div className="btnGrid2">
            <TapButton
              id="made2"
              activeId={lastTapId}
              tone="good"
              title="+2"
              sub="Made 2PT"
              onTap={() =>
                inc(
                  "made2",
                  "made2"
                )
              }
            />

            <TapButton
              id="miss2"
              activeId={lastTapId}
              tone="bad"
              title="2 Miss"
              sub="Missed 2PT"
              onTap={() =>
                inc(
                  "miss2",
                  "miss2"
                )
              }
            />

            <TapButton
              id="made3"
              activeId={lastTapId}
              tone="good"
              title="+3"
              sub="Made 3PT"
              onTap={() =>
                inc(
                  "made3",
                  "made3"
                )
              }
            />

            <TapButton
              id="miss3"
              activeId={lastTapId}
              tone="bad"
              title="3 Miss"
              sub="Missed 3PT"
              onTap={() =>
                inc(
                  "miss3",
                  "miss3"
                )
              }
            />

            <TapButton
              id="madeFT"
              activeId={lastTapId}
              tone="good"
              title="+FT"
              sub="Made FT"
              onTap={() =>
                inc(
                  "madeFT",
                  "madeFT"
                )
              }
            />

            <TapButton
              id="missFT"
              activeId={lastTapId}
              tone="bad"
              title="FT Miss"
              sub="Missed FT"
              onTap={() =>
                inc(
                  "missFT",
                  "missFT"
                )
              }
            />
          </div>

          {/* OTHER */}
          <div
            className="sectionLabel"
            style={{
              marginTop: 14,
            }}
          >
            HUSTLE + OTHER
          </div>

          <div className="btnGrid3">
            <TapButton
              id="orb"
              activeId={lastTapId}
              tone="neutral"
              title="ORB"
              sub="Off. Rebound"
              onTap={() =>
                inc("orb", "orb")
              }
            />

            <TapButton
              id="drb"
              activeId={lastTapId}
              tone="neutral"
              title="DRB"
              sub="Def. Rebound"
              onTap={() =>
                inc("drb", "drb")
              }
            />

            <TapButton
              id="ast"
              activeId={lastTapId}
              tone="neutral"
              title="AST"
              sub="Assist"
              onTap={() =>
                inc("ast", "ast")
              }
            />

            <TapButton
              id="to"
              activeId={lastTapId}
              tone="neutral"
              title="TO"
              sub="Turnover"
              onTap={() =>
                inc("to", "to")
              }
            />

            <TapButton
              id="stl"
              activeId={lastTapId}
              tone="neutral"
              title="STL"
              sub="Steal"
              onTap={() =>
                inc("stl", "stl")
              }
            />

            <TapButton
              id="pf"
              activeId={lastTapId}
              tone="neutral"
              title="FOUL"
              sub="Personal"
              onTap={() =>
                inc("pf", "pf")
              }
            />
          </div>

          <div
            className="field"
            style={{
              marginTop: 16,
            }}
          >
            <div className="label">
              NOTES
            </div>

            <textarea
              className="textarea"
              value={notes}
              onChange={(e) =>
                setNotes(
                  e.target.value
                )
              }
              placeholder="Optional notes…"
              rows={3}
            />
          </div>

          <div className="microHint">
            Every tap is automatically
            saved. Use Save Progress
            anytime you want an explicit
            safety save.
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">
                Flight Path
              </div>

              <div className="cardHint">
                {season.games} completed{" "}
                {season.games === 1
                  ? "game"
                  : "games"}
              </div>
            </div>
          </div>

          <div className="playerSummary">
            <div className="summaryKicker">
              PLAYER
            </div>

            <div className="summaryName">
              {fullName}
              {player.jerseyNumber
                ? ` · #${player.jerseyNumber}`
                : ""}
            </div>

            <div className="summaryMeta">
              {player.teamName ??
                "No team assigned"}
              {player.seasonName
                ? ` · ${player.seasonName}`
                : ""}
            </div>
          </div>

          <div className="sectionHeader">
            Season-to-date
          </div>

          <div className="seasonGrid">
            <div className="seasonChip">
              <div className="seasonLabel">
                GAMES
              </div>

              <div className="seasonValue">
                {season.games}
              </div>
            </div>

            <div className="seasonChip">
              <div className="seasonLabel">
                PPG
              </div>

              <div className="seasonValue">
                {season.ppg.toFixed(
                  1
                )}
              </div>
            </div>

            <div className="seasonChip">
              <div className="seasonLabel">
                RPG
              </div>

              <div className="seasonValue">
                {season.rpg.toFixed(
                  1
                )}
              </div>
            </div>

            <div className="seasonChip">
              <div className="seasonLabel">
                APG
              </div>

              <div className="seasonValue">
                {season.apg.toFixed(
                  1
                )}
              </div>
            </div>
          </div>

          <div
            className="sectionHeader"
            style={{
              marginTop: 18,
            }}
          >
            Recent Games
          </div>

          {completedGames.length ===
          0 ? (
            <div className="emptyBox">
              No completed games yet.
            </div>
          ) : (
            <div className="gamesList">
              {completedGames
                .slice(0, 5)
                .map((game) => (
                  <div
                    key={game.id}
                    className="gameCard"
                  >
                    <div className="gameTop">
                      <div className="gameTitle">
                        vs.{" "}
                        {
                          game.opponentName
                        }
                      </div>

                      <div className="gameDate">
                        {
                          game.gameDate
                        }
                      </div>
                    </div>

                    <div className="gameMeta">
                      {game.points} PTS
                      {" · "}
                      {game.rebounds} REB
                      {" · "}
                      {game.assists} AST
                      {" · "}
                      {game.steals} STL
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        :root {
          --bg: #f6f6f4;
          --card: #ffffff;
          --ink: #0b0b0b;
          --muted: rgba(0,0,0,.55);
          --line: rgba(0,0,0,.12);
          --shadow: 0 10px 25px rgba(0,0,0,.06);
          --radius: 18px;

          --good: #7ea6bf;
          --bad: #d0482e;
          --neutral: #7ea6bf;
        }

        * {
          box-sizing: border-box;
        }

        .loadingPage {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050505;
          color: #fff;
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          font-size: 12px;
          letter-spacing: .15em;
          font-weight: 800;
        }

        .page {
          padding: 28px 18px 40px;
          background: var(--bg);
          min-height: 100vh;
          color: var(--ink);
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        }

        .topBar {
          max-width: 1120px;
          margin: 0 auto 18px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .kicker {
          letter-spacing: .18em;
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .title {
          margin: 0;
          font-size: 34px;
          line-height: 1.08;
        }

        .subtitle {
          margin-top: 8px;
          color: var(--muted);
          font-size: 14px;
        }

        .topActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .grid {
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.1fr .9fr;
          gap: 18px;
          align-items: start;
        }

        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 18px;
        }

        .cardHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .cardTitle {
          font-weight: 900;
          font-size: 17px;
        }

        .cardHint {
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
        }

        .saveControls {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .saveStatus {
          font-size: 10px;
          color: rgba(0,0,0,.48);
          font-weight: 800;
          white-space: nowrap;
          letter-spacing: .04em;
        }

        .saveError {
          color: #b52f22;
        }

        .ghostBtn {
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
          touch-action: manipulation;
        }

        .ghostBtn:disabled {
          opacity: .4;
          cursor: not-allowed;
        }

        .primaryBtn {
          background: var(--ink);
          color: #fff;
          border: 0;
          border-radius: 999px;
          padding: 11px 15px;
          font-weight: 800;
          cursor: pointer;
          touch-action: manipulation;
        }

        .primaryBtn:disabled {
          opacity: .6;
          cursor: wait;
        }

        .formGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }

        .field .label,
        .label {
          font-size: 10px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(0,0,0,.52);
          margin-bottom: 6px;
          font-weight: 700;
        }

        .input,
        .textarea {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px;
          font-size: 14px;
          outline: none;
          background: #fff;
          color: #111;
        }

        .textarea {
          resize: vertical;
        }

        .lockedPlayer {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 13px 14px;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,.08);
          background: rgba(0,0,0,.025);
        }

        .lockedValue {
          font-size: 14px;
          font-weight: 800;
        }

        .statTilesWrap {
          margin-top: 14px;
        }

        .statTilesRow {
          display: grid;
          grid-template-columns: repeat(7, minmax(0,1fr));
          gap: 10px;
          align-items: stretch;
        }

        .statTilesRow2 {
          margin-top: 10px;
        }

        .chip {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px;
          background: #fff;
          min-height: 54px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }

        .chipLabel {
          font-size: 9px;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: rgba(0,0,0,.52);
          white-space: nowrap;
        }

        .chipValue {
          margin-top: 3px;
          font-size: 18px;
          font-weight: 900;
          white-space: nowrap;
        }

        .sectionLabel {
          margin-top: 16px;
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
        }

        .btnGrid2,
        .btnGrid3 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        .tapBtn {
          border: 0;
          border-radius: 18px;
          padding: 16px;
          cursor: pointer;
          color: #fff;
          text-align: left;
          min-height: 84px;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform 80ms ease, filter 120ms ease;
          box-shadow: 0 10px 20px rgba(0,0,0,.10);
        }

        .tapBtnTitle {
          font-size: 22px;
          font-weight: 900;
        }

        .tapBtnSub {
          margin-top: 6px;
          font-size: 13px;
          opacity: .92;
        }

        .tapBtnGood {
          background: #7ea6bf;
        }

        .tapBtnBad {
          background: #d9482d;
        }

        .tapBtnNeutral {
          background: #7ea6bf;
        }

        .tapBtnActive {
          filter: brightness(1.15);
          transform: scale(.98);
        }

        .microHint {
          margin-top: 12px;
          font-size: 12px;
          color: rgba(0,0,0,.52);
          line-height: 1.5;
        }

        .playerSummary {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          background: rgba(0,0,0,.02);
        }

        .summaryKicker {
          font-size: 9px;
          letter-spacing: .14em;
          color: rgba(0,0,0,.48);
          font-weight: 800;
          margin-bottom: 6px;
        }

        .summaryName {
          font-size: 20px;
          font-weight: 900;
        }

        .summaryMeta {
          margin-top: 5px;
          font-size: 12px;
          color: rgba(0,0,0,.55);
        }

        .sectionHeader {
          margin-top: 16px;
          font-weight: 900;
          font-size: 14px;
        }

        .seasonGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .seasonChip {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px;
          background: #fff;
        }

        .seasonLabel {
          font-size: 9px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(0,0,0,.5);
        }

        .seasonValue {
          margin-top: 4px;
          font-size: 21px;
          font-weight: 900;
        }

        .emptyBox {
          margin-top: 10px;
          border: 1px dashed var(--line);
          border-radius: 14px;
          padding: 14px;
          color: rgba(0,0,0,.55);
        }

        .gamesList {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .gameCard {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 13px;
          background: #fff;
        }

        .gameTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
        }

        .gameTitle {
          font-weight: 900;
          font-size: 14px;
        }

        .gameDate {
          font-size: 11px;
          color: rgba(0,0,0,.45);
        }

        .gameMeta {
          margin-top: 5px;
          color: rgba(0,0,0,.58);
          font-size: 12px;
        }

        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .cardHeader {
            flex-direction: column;
          }

          .saveControls {
            justify-content: flex-start;
          }

          .topBar {
            flex-direction: column;
          }

          .topActions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 900px) {
          .statTilesRow {
            grid-template-columns: repeat(4, minmax(0,1fr));
          }
        }

        @media (max-width: 520px) {
          .page {
            padding: 18px 12px 32px;
          }

          .title {
            font-size: 28px;
          }

          .formGrid,
          .lockedPlayer {
            grid-template-columns: 1fr;
          }

          .statTilesRow {
            grid-template-columns: repeat(3, minmax(0,1fr));
          }

          .saveControls {
            width: 100%;
          }

          .saveStatus {
            width: 100%;
          }

          .ghostBtn,
          .primaryBtn {
            min-height: 44px;
          }
        }
      `}</style>
    </div>
  );
}
