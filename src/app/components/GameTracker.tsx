"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/* =========================================================
   TYPES
========================================================= */

type LiveCounts = {
  made2: number;
  miss2: number;
  made3: number;
  miss3: number;
  madeFT: number;
  missFT: number;
  reb: number;
  ast: number;
  to: number;
  stl: number;
  blk: number;
  pf: number;
};

type Action = {
  key: keyof LiveCounts;
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
  playingSeconds: number;
  isInGame: boolean;
  liveSegmentStartedAt: number | null;
  flyScore: string;
  opponentScore: string;
};

type GameTrackerProps = {
  playerId: string;
  onGameSaved?: () => void;
  onExitGame?: () => void;
};

/* =========================================================
   CONSTANTS
========================================================= */

const emptyCounts: LiveCounts = {
  made2: 0,
  miss2: 0,
  made3: 0,
  miss3: 0,
  madeFT: 0,
  missFT: 0,
  reb: 0,
  ast: 0,
  to: 0,
  stl: 0,
  blk: 0,
  pf: 0,
};

/* =========================================================
   HELPERS
========================================================= */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function clampNonNeg(n: number) {
  return Math.max(0, n);
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${minutes}:${pad2(seconds)}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function GameTracker({
  playerId,
  onGameSaved,
  onExitGame,
}: GameTrackerProps) {
  /* PLAYER */

  const [player, setPlayer] = useState<PlayerContext | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [playerError, setPlayerError] = useState("");

  /* GAME */

  const [date, setDate] = useState(todayISO());
  const [opponent, setOpponent] = useState("");
  const [notes, setNotes] = useState("");

  const [flyScore, setFlyScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");

  /* STATS */

  const [counts, setCounts] = useState<LiveCounts>({
    ...emptyCounts,
  });

  const [history, setHistory] = useState<Action[]>([]);
  const [lastTapId, setLastTapId] = useState<string | null>(null);

  /* PLAYING TIME */

  const [playingSeconds, setPlayingSeconds] = useState(0);
  const [isInGame, setIsInGame] = useState(false);
  const [liveSegmentStartedAt, setLiveSegmentStartedAt] =
    useState<number | null>(null);

  const [displayedPlayingSeconds, setDisplayedPlayingSeconds] = useState(0);

  /* SAVE STATE */

  const [draftReady, setDraftReady] = useState(false);

  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const [finalizing, setFinalizing] = useState(false);
  const [vibOn, setVibOn] = useState(true);

  /* REFS */

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DRAFT_KEY = `flightPath.gameDraft.${playerId}`;

  /* =========================================================
     LOAD PLAYER
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayer() {
      setPlayerLoading(true);
      setPlayerError("");

      try {
        const { data: playerRecord, error: playerError } = await supabase
          .from("flight_players")
          .select("id, first_name, last_name")
          .eq("id", playerId)
          .single();

        if (playerError) throw playerError;

        const { data: membership, error: membershipError } = await supabase
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
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;
        if (cancelled) return;

        setPlayer({
          firstName: playerRecord.first_name ?? "",
          lastName: playerRecord.last_name ?? "",
          jerseyNumber: membership?.jersey_number ?? null,
          membershipId: membership?.id ?? null,

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
        console.error("Unable to load player:", error);

        if (!cancelled) {
          setPlayerError("Unable to load player information.");
        }
      } finally {
        if (!cancelled) {
          setPlayerLoading(false);
        }
      }
    }

    loadPlayer();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  /* =========================================================
     RESTORE LIVE DRAFT
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let localDraft: GameDraft | null = null;

        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem(DRAFT_KEY);

            if (raw) {
              localDraft = JSON.parse(raw) as GameDraft;
            }
          } catch (error) {
            console.error("Unable to read local draft:", error);
          }
        }

        let cloudDraft: any = null;

        if (user) {
          const { data, error } = await supabase
            .from("flight_game_drafts")
            .select("*")
            .eq("player_id", playerId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (error) {
            console.error("Unable to load cloud draft:", error);
          } else {
            cloudDraft = data;
          }
        }

        if (cancelled) return;

        const cloudUpdatedAt = cloudDraft?.updated_at
          ? new Date(cloudDraft.updated_at).getTime()
          : 0;

        const localUpdatedAt = localDraft?.updatedAt ?? 0;

        if (localDraft && localUpdatedAt >= cloudUpdatedAt) {
          setDate(localDraft.date || todayISO());
          setOpponent(localDraft.opponent || "");
          setNotes(localDraft.notes || "");

          setCounts({
            ...emptyCounts,
            ...localDraft.counts,
          });

          setPlayingSeconds(localDraft.playingSeconds ?? 0);
          setIsInGame(localDraft.isInGame ?? false);

          setLiveSegmentStartedAt(localDraft.liveSegmentStartedAt ?? null);

          setFlyScore(localDraft.flyScore ?? "");
          setOpponentScore(localDraft.opponentScore ?? "");
        } else if (cloudDraft) {
          setDate(cloudDraft.game_date || todayISO());
          setOpponent(cloudDraft.opponent_name || "");
          setNotes(cloudDraft.game_note || "");

          setCounts({
            made2: cloudDraft.two_pt_made ?? 0,
            miss2: cloudDraft.two_pt_missed ?? 0,

            made3: cloudDraft.three_pt_made ?? 0,
            miss3: cloudDraft.three_pt_missed ?? 0,

            madeFT: cloudDraft.ft_made ?? 0,
            missFT: cloudDraft.ft_missed ?? 0,

            reb:
              (cloudDraft.offensive_rebounds ?? 0) +
              (cloudDraft.defensive_rebounds ?? 0),

            ast: cloudDraft.assists ?? 0,
            to: cloudDraft.turnovers ?? 0,
            stl: cloudDraft.steals ?? 0,
            blk: cloudDraft.blocks ?? 0,
            pf: cloudDraft.fouls ?? 0,
          });

          setPlayingSeconds(cloudDraft.playing_seconds ?? 0);

          // Cloud recovery resumes safely in OUT state.
          setIsInGame(false);
          setLiveSegmentStartedAt(null);
        }
      } catch (error) {
        console.error("Flight Path draft restore failed:", error);
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

  /* =========================================================
     PLAYING TIME CLOCK
  ========================================================= */

  useEffect(() => {
    function updateDisplayedTime() {
      let total = playingSeconds;

      if (isInGame && liveSegmentStartedAt) {
        total += Math.floor((Date.now() - liveSegmentStartedAt) / 1000);
      }

      setDisplayedPlayingSeconds(total);
    }

    updateDisplayedTime();

    if (!isInGame) return;

    const timer = window.setInterval(updateDisplayedTime, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [playingSeconds, isInGame, liveSegmentStartedAt]);

  /* =========================================================
     DERIVED STATS
  ========================================================= */

  const liveStats = useMemo(() => {
    const fgm = counts.made2 + counts.made3;

    const fga =
      counts.made2 + counts.miss2 + counts.made3 + counts.miss3;

    const threeAttempts = counts.made3 + counts.miss3;
    const ftAttempts = counts.madeFT + counts.missFT;

    const pts =
      counts.made2 * 2 +
      counts.made3 * 3 +
      counts.madeFT;

    return {
      pts,
      reb: counts.reb,
      ast: counts.ast,
      stl: counts.stl,
      to: counts.to,
      blk: counts.blk,
      pf: counts.pf,

      fgm,
      fga,

      threeMade: counts.made3,
      threeAttempts,

      ftMade: counts.madeFT,
      ftAttempts,
    };
  }, [counts]);

  /* =========================================================
     SAVE HELPERS
  ========================================================= */

  function getCurrentPlayingSeconds() {
    if (isInGame && liveSegmentStartedAt) {
      return (
        playingSeconds +
        Math.floor((Date.now() - liveSegmentStartedAt) / 1000)
      );
    }

    return playingSeconds;
  }

  function makeLocalDraft(): GameDraft {
    return {
      updatedAt: Date.now(),

      date,
      opponent,
      notes,

      counts: {
        ...counts,
      },

      playingSeconds: getCurrentPlayingSeconds(),

      isInGame,
      liveSegmentStartedAt,

      flyScore,
      opponentScore,
    };
  }

  function saveLocalDraft() {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(makeLocalDraft()));
    } catch (error) {
      console.error("Unable to save local draft:", error);
    }
  }

  async function saveCloudDraft() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Please sign in again.");
    }

    const { error } = await supabase
      .from("flight_game_drafts")
      .upsert(
        {
          player_id: playerId,
          user_id: user.id,

          game_date: date || todayISO(),
          opponent_name: opponent.trim(),
          game_note: notes.trim() || null,

          two_pt_made: counts.made2,
          two_pt_missed: counts.miss2,

          three_pt_made: counts.made3,
          three_pt_missed: counts.miss3,

          ft_made: counts.madeFT,
          ft_missed: counts.missFT,

          offensive_rebounds: 0,
          defensive_rebounds: counts.reb,

          assists: counts.ast,
          steals: counts.stl,
          turnovers: counts.to,
          blocks: counts.blk,
          fouls: counts.pf,

          playing_seconds: getCurrentPlayingSeconds(),
        },
        {
          onConflict: "player_id,user_id",
        }
      );

    if (error) throw error;
  }

  /* =========================================================
     AUTOSAVE
  ========================================================= */

  useEffect(() => {
    if (!draftReady) return;

    saveLocalDraft();

    setSaveState("saving");

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = setTimeout(async () => {
      try {
        await saveCloudDraft();

        setSaveState("saved");

        if (saveStatusTimerRef.current) {
          clearTimeout(saveStatusTimerRef.current);
        }

        saveStatusTimerRef.current = setTimeout(() => {
          setSaveState("idle");
        }, 1400);
      } catch (error) {
        console.error("Autosave failed:", error);
        setSaveState("error");
      }
    }, 300);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [
    draftReady,
    date,
    opponent,
    notes,
    counts,
    playingSeconds,
    isInGame,
    liveSegmentStartedAt,
    flyScore,
    opponentScore,
  ]);

  /* =========================================================
     SAVE WHEN APP HIDES
  ========================================================= */

  useEffect(() => {
    function emergencyLocalSave() {
      saveLocalDraft();
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        emergencyLocalSave();
      }
    }

    window.addEventListener("pagehide", emergencyLocalSave);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", emergencyLocalSave);

      document.removeEventListener("visibilitychange", handleVisibility);
    };
  });

  /* =========================================================
     HAPTIC + TAP FEEDBACK
  ========================================================= */

  function tapFeedback(id: string, strength: "normal" | "strong" = "normal") {
    setLastTapId(id);

    window.setTimeout(() => {
      setLastTapId(null);
    }, 150);

    if (
      vibOn &&
      typeof navigator !== "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate(strength === "strong" ? 35 : 24);
    }
  }

  function increment(key: keyof LiveCounts, id: string) {
    tapFeedback(id, "strong");

    setCounts((current) => ({
      ...current,
      [key]: current[key] + 1,
    }));

    setHistory((current) => [...current, { key }]);
  }

  function undo() {
    setHistory((current) => {
      if (!current.length) return current;

      const last = current[current.length - 1];

      setCounts((existing) => ({
        ...existing,
        [last.key]: clampNonNeg(existing[last.key] - 1),
      }));

      tapFeedback("undo");

      return current.slice(0, -1);
    });
  }

  /* =========================================================
     IN / OUT
  ========================================================= */

  function subIn() {
    if (isInGame) return;

    setLiveSegmentStartedAt(Date.now());
    setIsInGame(true);

    tapFeedback("in-game", "strong");
  }

  function subOut() {
    if (!isInGame || !liveSegmentStartedAt) return;

    const segmentSeconds = Math.floor(
      (Date.now() - liveSegmentStartedAt) / 1000
    );

    setPlayingSeconds((current) => current + segmentSeconds);

    setLiveSegmentStartedAt(null);
    setIsInGame(false);

    tapFeedback("subbed-out", "strong");
  }

  /* =========================================================
     SAVE PROGRESS
  ========================================================= */

  async function saveProgress() {
    try {
      setSaveState("saving");

      saveLocalDraft();
      await saveCloudDraft();

      tapFeedback("save-progress", "strong");

      setSaveState("saved");

      if (saveStatusTimerRef.current) {
        clearTimeout(saveStatusTimerRef.current);
      }

      saveStatusTimerRef.current = setTimeout(() => {
        setSaveState("idle");
      }, 1800);
    } catch (error) {
      console.error("Save Progress failed:", error);

      setSaveState("error");

      alert(
        "Your game is saved on this device, but we could not confirm the cloud save. Try Save Progress again."
      );
    }
  }

  /* =========================================================
     RESET
  ========================================================= */

  function resetGame() {
    const confirmed = window.confirm(
      "Reset this live game?\n\nThis clears the current stats, score, playing time, opponent and notes."
    );

    if (!confirmed) return;

    setCounts({ ...emptyCounts });
    setHistory([]);

    setOpponent("");
    setNotes("");

    setFlyScore("");
    setOpponentScore("");

    setPlayingSeconds(0);
    setDisplayedPlayingSeconds(0);

    setIsInGame(false);
    setLiveSegmentStartedAt(null);

    setDate(todayISO());
  }

  /* =========================================================
     COMPLETE GAME
  ========================================================= */

  async function completeGame() {
    if (!player) {
      alert("Player information is still loading.");
      return;
    }

    if (!player.membershipId) {
      alert("We could not find this player's current team membership.");
      return;
    }

    const opponentName = opponent.trim();

    if (!opponentName) {
      alert("Please enter the opponent before completing the game.");
      return;
    }

    if (flyScore.trim() === "" || opponentScore.trim() === "") {
      alert("Please enter the final score before completing the game.");
      return;
    }

    const flyFinal = Number(flyScore);
    const opponentFinal = Number(opponentScore);

    if (Number.isNaN(flyFinal) || Number.isNaN(opponentFinal)) {
      alert("Please enter valid final scores.");
      return;
    }

    const result =
      flyFinal > opponentFinal
        ? "W"
        : flyFinal < opponentFinal
        ? "L"
        : "T";

    const fullName =
      `${player.firstName} ${player.lastName}`.trim();

    const confirmed = window.confirm(
      `Complete ${fullName}'s game vs. ${opponentName}?\n\n` +
        `${result} ${flyFinal}-${opponentFinal}\n` +
        `${liveStats.pts} PTS · ${liveStats.reb} REB · ` +
        `${liveStats.ast} AST · ${liveStats.stl} STL\n\n` +
        `This saves the final game to Flight Path.`
    );

    if (!confirmed) return;

    setFinalizing(true);

    try {
      const finalPlayingSeconds = getCurrentPlayingSeconds();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please sign in again.");
      }

      /* -----------------------------------------------
         ACCESS
      ----------------------------------------------- */

      const { data: entitlement, error: entitlementError } =
        await supabase
          .from("flight_entitlements")
          .select("id, games_total, games_used")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (entitlementError) throw entitlementError;

      if (!entitlement) {
        throw new Error(
          "No active game access was found for this account."
        );
      }

      const gamesTotal = entitlement.games_total ?? 0;
      const gamesUsed = entitlement.games_used ?? 0;

      if (gamesUsed >= gamesTotal) {
        throw new Error(
          "There are no game credits remaining on this account."
        );
      }

      /* -----------------------------------------------
         CREATE GAME
      ----------------------------------------------- */

      const { data: game, error: gameError } = await supabase
        .from("flight_games")
        .insert({
          player_id: playerId,
          team_membership_id: player.membershipId,
          created_by: user.id,

          game_date: date || todayISO(),
          opponent_name: opponentName,

          fly_score: flyFinal,
          opponent_score: opponentFinal,

          result,

          game_note: notes.trim() || null,

          completed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (gameError) throw gameError;

      /* -----------------------------------------------
         STATS
      ----------------------------------------------- */

      const { error: statsError } = await supabase
        .from("flight_game_stats")
        .insert({
          game_id: game.id,

          two_pt_made: counts.made2,
          two_pt_missed: counts.miss2,

          three_pt_made: counts.made3,
          three_pt_missed: counts.miss3,

          ft_made: counts.madeFT,
          ft_missed: counts.missFT,

          rebounds: counts.reb,

          assists: counts.ast,
          steals: counts.stl,
          turnovers: counts.to,
          blocks: counts.blk,
          fouls: counts.pf,

          playing_seconds: finalPlayingSeconds,
        });

      if (statsError) {
        await supabase
          .from("flight_games")
          .delete()
          .eq("id", game.id);

        throw statsError;
      }

      /* -----------------------------------------------
   CONSUME CREDIT
----------------------------------------------- */

const { error: creditError } = await supabase.rpc(
  "consume_flight_game_credit",
  {
    p_user_id: user.id,
  }
);

if (creditError) {
  await supabase
    .from("flight_game_stats")
    .delete()
    .eq("game_id", game.id);

  await supabase
    .from("flight_games")
    .delete()
    .eq("id", game.id);

  throw creditError;
}

      /* -----------------------------------------------
         CLEAR CLOUD DRAFT
      ----------------------------------------------- */

      const { error: draftDeleteError } = await supabase
        .from("flight_game_drafts")
        .delete()
        .eq("player_id", playerId)
        .eq("user_id", user.id);

      if (draftDeleteError) {
        console.error(
          "Game completed, but draft cleanup failed:",
          draftDeleteError
        );
      }

      /* -----------------------------------------------
         CLEAR LOCAL DRAFT
      ----------------------------------------------- */

      if (typeof window !== "undefined") {
        localStorage.removeItem(DRAFT_KEY);
      }

      /* -----------------------------------------------
         HAPTIC SUCCESS
      ----------------------------------------------- */

      if (
        vibOn &&
        typeof navigator !== "undefined" &&
        "vibrate" in navigator
      ) {
        navigator.vibrate([45, 35, 80]);
      }

      /* -----------------------------------------------
         CLEAR LOCAL STATE
      ----------------------------------------------- */

      setCounts({ ...emptyCounts });
      setHistory([]);

      setOpponent("");
      setNotes("");

      setFlyScore("");
      setOpponentScore("");

      setPlayingSeconds(0);
      setDisplayedPlayingSeconds(0);

      setLiveSegmentStartedAt(null);
      setIsInGame(false);

      setDate(todayISO());

      if (onGameSaved) {
        onGameSaved();
      }
    } catch (error) {
      console.error("Could not complete game:", error);

      alert(
        error instanceof Error
          ? error.message
          : "We couldn't complete the game. Your live game has not been cleared."
      );
    } finally {
      setFinalizing(false);
    }
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (playerLoading) {
    return (
      <main className="loading">
        <div className="loadingPlane">➤</div>
        <div>LOADING FLIGHT PATH</div>
      </main>
    );
  }

  if (playerError || !player) {
    return (
      <main className="loading">
        <div>UNABLE TO LOAD PLAYER</div>
      </main>
    );
  }

  const fullName =
    `${player.firstName} ${player.lastName}`.trim();

  const result =
    flyScore !== "" && opponentScore !== ""
      ? Number(flyScore) > Number(opponentScore)
        ? "W"
        : Number(flyScore) < Number(opponentScore)
        ? "L"
        : "T"
      : null;

  const saveLabel =
    saveState === "saving"
      ? "SAVING"
      : saveState === "saved"
      ? "SAVED ✓"
      : saveState === "error"
      ? "SAVE ISSUE"
      : "AUTO-SAVED ✓";

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="page">
      <section className="phoneApp">
        {/* HEADER */}

        <header className="topHeader">
          <button
            type="button"
            className="backButton"
            onClick={onExitGame}
            aria-label="Back"
          >
            ‹
          </button>

          <div className="identity">
            <span>{fullName.toUpperCase()}</span>

            {player.jerseyNumber && (
              <b>#{player.jerseyNumber}</b>
            )}
          </div>

          <button
            type="button"
            className={`hapticButton ${vibOn ? "active" : ""}`}
            onClick={() => setVibOn((v) => !v)}
            aria-label="Toggle vibration"
          >
            ⚙
          </button>
        </header>

        {/* GAME STATUS */}

        <div className="statusBar">
          <button
            type="button"
            className={`gameStatus ${
              isInGame ? "gameStatusOn" : ""
            }`}
            onClick={isInGame ? subOut : subIn}
          >
            <span className="gameDot" />

            {isInGame ? "IN GAME" : "SUBBED OUT"}
          </button>

          <div className="gameClock">
            <strong>
              {formatClock(displayedPlayingSeconds)}
            </strong>

            <span>PLAYING TIME</span>
          </div>
        </div>

        {/* GAME INFO */}

        <div className="gameMeta">
          <div>
            <span>VS</span>

            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="OPPONENT"
            />
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="dateInput"
          />
        </div>

        {/* LIVE SUMMARY */}

        <section className="liveStrip">
          <div className="liveStripTop">
            <span>LIVE STATS</span>

            <span
              className={
                saveState === "error"
                  ? "saveError"
                  : "saveText"
              }
            >
              {saveLabel}
            </span>
          </div>

          <div className="primaryLine">
            <div>
              <strong>{liveStats.pts}</strong>
              <span>PTS</span>
            </div>

            <div>
              <strong>{liveStats.reb}</strong>
              <span>REB</span>
            </div>

            <div>
              <strong>{liveStats.ast}</strong>
              <span>AST</span>
            </div>

            <div>
              <strong>{liveStats.stl}</strong>
              <span>STL</span>
            </div>
          </div>

          <div className="shootingLine">
            <span>
              FG <b>{liveStats.fgm}-{liveStats.fga}</b>
            </span>

            <span>
              3PT{" "}
              <b>
                {liveStats.threeMade}-{liveStats.threeAttempts}
              </b>
            </span>

            <span>
              FT{" "}
              <b>
                {liveStats.ftMade}-{liveStats.ftAttempts}
              </b>
            </span>

            <span>
              TO <b>{liveStats.to}</b>
            </span>

            <span>
              BLK <b>{liveStats.blk}</b>
            </span>

            <span>
              FL <b>{liveStats.pf}</b>
            </span>
          </div>
        </section>

        {/* SHOOTING */}

        <section className="shootingCard">
          <div className="shootingTitle">2-POINT FG</div>

          <div className="shootingButtons">
            <button
              type="button"
              className={`statButton make ${
                lastTapId === "made2" ? "registered" : ""
              }`}
              onClick={() => increment("made2", "made2")}
            >
              <strong>+2</strong>
              <span>MAKE</span>
            </button>

            <button
              type="button"
              className={`statButton miss ${
                lastTapId === "miss2" ? "registered" : ""
              }`}
              onClick={() => increment("miss2", "miss2")}
            >
              <strong>Ø2</strong>
              <span>MISS</span>
            </button>
          </div>
        </section>

        <section className="shootingCard">
          <div className="shootingTitle">3-POINT FG</div>

          <div className="shootingButtons">
            <button
              type="button"
              className={`statButton make ${
                lastTapId === "made3" ? "registered" : ""
              }`}
              onClick={() => increment("made3", "made3")}
            >
              <strong>+3</strong>
              <span>MAKE</span>
            </button>

            <button
              type="button"
              className={`statButton miss ${
                lastTapId === "miss3" ? "registered" : ""
              }`}
              onClick={() => increment("miss3", "miss3")}
            >
              <strong>Ø3</strong>
              <span>MISS</span>
            </button>
          </div>
        </section>

        <section className="shootingCard">
          <div className="shootingTitle">FREE THROWS</div>

          <div className="shootingButtons">
            <button
              type="button"
              className={`statButton make ${
                lastTapId === "madeFT" ? "registered" : ""
              }`}
              onClick={() => increment("madeFT", "madeFT")}
            >
              <strong>+1</strong>
              <span>MAKE</span>
            </button>

            <button
              type="button"
              className={`statButton miss ${
                lastTapId === "missFT" ? "registered" : ""
              }`}
              onClick={() => increment("missFT", "missFT")}
            >
              <strong>Ø1</strong>
              <span>MISS</span>
            </button>
          </div>
        </section>

        {/* OTHER STATS */}

        <section className="otherGrid">
          {[
            ["reb", "REB"],
            ["ast", "AST"],
            ["stl", "STL"],
            ["to", "TO"],
            ["blk", "BLK"],
            ["pf", "FL"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`otherStat ${
                lastTapId === key ? "otherRegistered" : ""
              }`}
              onClick={() =>
                increment(
                  key as keyof LiveCounts,
                  key
                )
              }
            >
              <strong>{label}</strong>

              <span>
                {counts[key as keyof LiveCounts]}
              </span>
            </button>
          ))}
        </section>

        {/* PLAYING TIME */}

        <div className="moduleTitle">
          PLAYING TIME
        </div>

        <section className="subRow">
          <button
            type="button"
            className={`subButton in ${
              isInGame ? "selected" : ""
            } ${
              lastTapId === "in-game"
                ? "subFlash"
                : ""
            }`}
            onClick={subIn}
          >
            <div className="subIcon">●</div>

            <div>
              <strong>IN GAME</strong>
              <span>TAP WHEN IN</span>
            </div>
          </button>

          <button
            type="button"
            className={`subButton out ${
              !isInGame ? "selected" : ""
            } ${
              lastTapId === "subbed-out"
                ? "subFlash"
                : ""
            }`}
            onClick={subOut}
          >
            <div className="subIcon">◼</div>

            <div>
              <strong>SUBBED OUT</strong>
              <span>TAP WHEN OUT</span>
            </div>
          </button>
        </section>

        {/* SAVE UTILITIES */}

        <section className="utilityRow">
          <button
            type="button"
            disabled={!history.length}
            onClick={undo}
            className={
              lastTapId === "undo"
                ? "utilityFlash"
                : ""
            }
          >
            ↶ UNDO
          </button>

          <button
            type="button"
            onClick={saveProgress}
            className={
              lastTapId === "save-progress"
                ? "utilityFlash"
                : ""
            }
          >
            SAVE PROGRESS
          </button>

          <button
            type="button"
            onClick={resetGame}
          >
            RESET
          </button>
        </section>

        {/* GAME RESULT */}

        <section className="resultCard">
          <div className="moduleTitle resultTitle">
            GAME RESULT
          </div>

          <div className="resultContent">
            <div className="scoreGroup">
              <span className="miniLabel">
                FINAL SCORE
              </span>

              <div className="scoreInputs">
                <label>
                  <span className="flyLabel">
                    FLY
                  </span>

                  <input
                    inputMode="numeric"
                    value={flyScore}
                    onChange={(e) =>
                      setFlyScore(
                        e.target.value.replace(
                          /\D/g,
                          ""
                        )
                      )
                    }
                    placeholder="0"
                  />
                </label>

                <span className="scoreDash">
                  –
                </span>

                <label>
                  <span>OPPONENT</span>

                  <input
                    inputMode="numeric"
                    value={opponentScore}
                    onChange={(e) =>
                      setOpponentScore(
                        e.target.value.replace(
                          /\D/g,
                          ""
                        )
                      )
                    }
                    placeholder="0"
                  />
                </label>
              </div>
            </div>

            <div className="resultGroup">
              <span className="miniLabel">
                RESULT
              </span>

              <div
                className={`resultSquare ${
                  result === "W"
                    ? "win"
                    : result === "L"
                    ? "loss"
                    : result === "T"
                    ? "tie"
                    : ""
                }`}
              >
                {result ?? "—"}
              </div>
            </div>
          </div>

          <textarea
            className="gameNotes"
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value)
            }
            placeholder="GAME NOTE · OPTIONAL"
            rows={2}
          />

          <button
            type="button"
            className="completeGame"
            onClick={completeGame}
            disabled={finalizing}
          >
            <strong>
              {finalizing
                ? "SAVING GAME..."
                : "COMPLETE GAME"}
            </strong>

            <span>
              SAVE STATS & FINAL SCORE
            </span>
          </button>
        </section>
      </section>

      {/* =====================================================
          STYLES
      ===================================================== */}

      <style>{`
        :root {
          --black: #000000;
          --panel: #080808;
          --panel2: #0d0d0e;
          --line: #333338;
          --lineSoft: #202024;

          --white: #ffffff;
          --muted: #89898e;
          --muted2: #5e5e64;

          --green: #00dd42;
          --greenDeep: #008b27;
          --greenGlow: rgba(0, 255, 75, .48);

          --red: #ff1717;
          --redDeep: #a10000;
          --redGlow: rgba(255, 20, 20, .5);

          --purple: #8332d4;
          --purpleBright: #a74dff;
          --purpleGlow: rgba(143, 51, 219, .55);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          background: #000;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
        }

        .loading {
          min-height: 100vh;
          background: #000;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;

          font-family:
            "Arial Narrow",
            "Helvetica Neue Condensed",
            Arial,
            sans-serif;

          font-size: 12px;
          font-weight: 800;
          letter-spacing: .2em;
        }

        .loadingPlane {
          color: var(--purpleBright);
          font-size: 36px;
          transform: rotate(-20deg);
        }

        .page {
          min-height: 100vh;
          width: 100%;

          background:
            radial-gradient(
              circle at 50% -18%,
              #161616 0%,
              #050505 35%,
              #000 67%
            );

          color: #fff;

          padding:
            env(safe-area-inset-top, 12px)
            12px
            calc(env(safe-area-inset-bottom, 10px) + 32px);

          font-family:
            "Arial Narrow",
            "Helvetica Neue Condensed",
            "Helvetica Neue",
            Arial,
            sans-serif;
        }

        .phoneApp {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }

        /* HEADER */

        .topHeader {
          display: grid;
          grid-template-columns: 50px 1fr 50px;
          align-items: center;
          min-height: 65px;
        }

        .backButton,
        .hapticButton {
          width: 48px;
          height: 48px;

          border: none;
          background: transparent;
          color: #fff;

          display: flex;
          align-items: center;
          justify-content: center;

          cursor: pointer;
        }

        .backButton {
          font-size: 46px;
          font-weight: 200;
          justify-content: flex-start;
        }

        .hapticButton {
          font-size: 25px;
          color: #777;
        }

        .hapticButton.active {
          color: #fff;
        }

        .identity {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;

          font-size: 22px;
          font-weight: 900;
          letter-spacing: .035em;

          white-space: nowrap;
        }

        .identity b {
          font-size: 18px;
          font-weight: 800;
        }

        /* STATUS */

        .statusBar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;

          min-height: 60px;
          padding: 0 9px;
        }

        .gameStatus {
          border: 0;
          background: transparent;

          display: flex;
          align-items: center;
          gap: 11px;

          color: #777;

          font-size: 20px;
          font-weight: 900;
          letter-spacing: .05em;

          cursor: pointer;
        }

        .gameDot {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #56565c;
        }

        .gameStatusOn {
          color: var(--green);
        }

        .gameStatusOn .gameDot {
          background: var(--green);

          box-shadow:
            0 0 10px var(--greenGlow),
            0 0 22px rgba(0, 255, 60, .24);
        }

        .gameClock {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .gameClock strong {
          font-size: 35px;
          line-height: .95;
          font-weight: 500;
        }

        .gameClock span {
          margin-top: 5px;

          font-size: 9px;
          font-weight: 800;
          color: #a6a6aa;
          letter-spacing: .12em;
        }

        /* GAME META */

        .gameMeta {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 7px;

          margin-bottom: 7px;
        }

        .gameMeta > div,
        .dateInput {
          height: 41px;

          border: 1px solid #2c2c30;
          border-radius: 9px;
          background: #080809;

          color: white;
        }

        .gameMeta > div {
          display: flex;
          align-items: center;
          gap: 7px;

          padding: 0 11px;
        }

        .gameMeta > div > span {
          font-size: 10px;
          font-weight: 900;
          color: var(--purpleBright);
          letter-spacing: .1em;
        }

        .gameMeta input {
          min-width: 0;
          flex: 1;

          border: 0;
          outline: 0;
          background: transparent;
          color: white;

          font-weight: 800;
        }

        .gameMeta input::placeholder {
          color: #535359;
        }

        .dateInput {
          width: 128px;
          padding: 0 9px;

          outline: none;

          color-scheme: dark;

          font-size: 11px;
        }

        /* LIVE STATS */

        .liveStrip {
          border: 1px solid #29292e;
          border-radius: 10px;

          background:
            linear-gradient(
              180deg,
              rgba(19, 19, 21, .9),
              rgba(5, 5, 6, .96)
            );

          padding: 7px 8px 8px;

          margin-bottom: 8px;
        }

        .liveStripTop {
          display: flex;
          justify-content: space-between;
          align-items: center;

          margin: 0 3px 6px;

          color: #64646a;

          font-size: 8px;
          font-weight: 900;
          letter-spacing: .14em;
        }

        .saveText {
          color: #777;
        }

        .saveError {
          color: #ff4646;
        }

        .primaryLine {
          display: grid;
          grid-template-columns: repeat(4, 1fr);

          min-height: 46px;

          border: 1px solid #252529;
          border-radius: 8px;

          overflow: hidden;
        }

        .primaryLine > div {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          border-right: 1px solid #252529;
        }

        .primaryLine > div:last-child {
          border-right: 0;
        }

        .primaryLine strong {
          font-size: 20px;
          line-height: 1;
          font-weight: 900;
        }

        .primaryLine span {
          margin-top: 4px;

          color: #75757a;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .1em;
        }

        .shootingLine {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;

          gap: 3px 14px;

          padding-top: 7px;

          color: #75757a;
          font-size: 9px;
          font-weight: 700;
        }

        .shootingLine b {
          color: #ddd;
        }

        /* SHOOTING CARDS */

        .shootingCard {
          position: relative;

          border: 1px solid #343438;
          border-radius: 11px;

          background:
            linear-gradient(
              180deg,
              rgba(10, 10, 11, .85),
              rgba(2, 2, 2, .97)
            );

          padding: 16px 8px 8px;
          margin-bottom: 7px;
        }

        .shootingTitle {
          position: absolute;
          top: -1px;
          left: 50%;
          transform: translate(-50%, -50%);

          padding: 0 12px;

          background: #050505;

          color: #f4f4f4;

          font-size: 12px;
          font-weight: 900;
          letter-spacing: .07em;

          white-space: nowrap;
        }

        .shootingButtons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .statButton {
          min-height: 68px;

          border-radius: 11px;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          color: white;

          position: relative;
          overflow: hidden;

          cursor: pointer;

          transform: translateZ(0);

          transition:
            transform 90ms ease,
            filter 90ms ease,
            box-shadow 90ms ease;
        }

        .statButton::after {
          content: "";

          position: absolute;
          inset: 0;

          background: rgba(255,255,255,0);

          pointer-events: none;

          transition: background 90ms ease;
        }

        .statButton strong {
          font-size: 35px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .statButton span {
          margin-top: 7px;

          font-size: 11px;
          font-weight: 900;
          letter-spacing: .06em;
        }

        .statButton.make {
          border: 2px solid #00e444;

          background:
            linear-gradient(
              125deg,
              #006d1d 0%,
              #00a52f 55%,
              #008928 100%
            );

          box-shadow:
            inset 0 0 20px rgba(0,255,75,.08);
        }

        .statButton.miss {
          border: 2px solid #ff2020;

          background:
            linear-gradient(
              125deg,
              #8d0000 0%,
              #d50606 55%,
              #a00000 100%
            );

          box-shadow:
            inset 0 0 20px rgba(255,30,30,.09);
        }

        /*
          THIS IS THE IMPORTANT NEW FEEDBACK.

          During registration the button:
          - compresses
          - gets much brighter
          - produces a glow
          - gets a white overlay flash
        */

        .statButton.registered {
          transform: scale(.955);
          filter: brightness(1.5) saturate(1.25);
        }

        .statButton.make.registered {
          box-shadow:
            0 0 8px #33ff6d,
            0 0 22px var(--greenGlow),
            inset 0 0 28px rgba(255,255,255,.25);
        }

        .statButton.miss.registered {
          box-shadow:
            0 0 8px #ff5b5b,
            0 0 22px var(--redGlow),
            inset 0 0 28px rgba(255,255,255,.23);
        }

        .statButton.registered::after {
          background: rgba(255,255,255,.18);
        }

        /* OTHER STATS */

        .otherGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;

          border: 1px solid #343438;
          border-radius: 11px;

          padding: 8px;
          margin-bottom: 8px;

          background: #030303;
        }

        .otherStat {
          min-height: 56px;

          border: 1.5px solid #a0a0a4;
          border-radius: 9px;

          background:
            linear-gradient(
              180deg,
              #0d0d0e,
              #030303
            );

          color: white;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;

          cursor: pointer;

          transition:
            transform 90ms ease,
            background 90ms ease,
            box-shadow 90ms ease;
        }

        .otherStat strong {
          font-size: 21px;
          font-weight: 900;
          letter-spacing: .03em;
        }

        .otherStat span {
          min-width: 20px;
          height: 20px;

          padding: 0 5px;

          border-radius: 999px;

          display: flex;
          align-items: center;
          justify-content: center;

          background: #232327;

          color: #aaa;

          font-size: 9px;
          font-weight: 900;
        }

        .otherRegistered {
          transform: scale(.95);

          background:
            linear-gradient(
              180deg,
              #38204e,
              #120919
            );

          border-color: var(--purpleBright);

          box-shadow:
            0 0 7px var(--purpleBright),
            0 0 20px var(--purpleGlow),
            inset 0 0 22px rgba(255,255,255,.14);
        }

        .otherRegistered span {
          background: var(--purpleBright);
          color: white;
        }

        /* PLAYING TIME */

        .moduleTitle {
          margin: 8px 0 5px;

          text-align: center;

          color: #ededed;

          font-size: 12px;
          font-weight: 900;
          letter-spacing: .09em;
        }

        .subRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;

          margin-bottom: 8px;
        }

        .subButton {
          min-height: 67px;

          border-radius: 11px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          color: white;

          cursor: pointer;

          transition:
            transform 100ms ease,
            filter 100ms ease,
            box-shadow 100ms ease;
        }

        .subIcon {
          font-size: 25px;
          line-height: 1;
        }

        .subButton > div:last-child {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .subButton strong {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .subButton span {
          margin-top: 3px;

          font-size: 9px;
          font-weight: 700;
          color: #cacaca;
          letter-spacing: .04em;
        }

        .subButton.in {
          border: 1px solid #18883b;
          background: #0a2713;
          opacity: .72;
        }

        .subButton.in.selected {
          border-color: var(--green);

          background:
            linear-gradient(
              125deg,
              #008426,
              #00af35
            );

          opacity: 1;

          box-shadow:
            inset 0 0 18px rgba(255,255,255,.09),
            0 0 18px rgba(0,220,60,.14);
        }

        .subButton.out {
          border: 1px solid #505055;
          background: #161617;
          opacity: .72;
        }

        .subButton.out.selected {
          border-color: #777;
          background:
            linear-gradient(
              135deg,
              #29292b,
              #151516
            );

          opacity: 1;
        }

        .subFlash {
          transform: scale(.96);
          filter: brightness(1.35);
        }

        /* UTILITIES */

        .utilityRow {
          display: grid;
          grid-template-columns: 1fr 1.4fr 1fr;
          gap: 6px;

          margin-bottom: 8px;
        }

        .utilityRow button {
          height: 36px;

          border: 1px solid #313136;
          border-radius: 8px;

          background: #09090a;
          color: #98989d;

          font-size: 9px;
          font-weight: 900;
          letter-spacing: .06em;

          cursor: pointer;
        }

        .utilityRow button:disabled {
          opacity: .25;
        }

        .utilityFlash {
          color: white !important;
          border-color: var(--purpleBright) !important;

          box-shadow:
            0 0 15px var(--purpleGlow) !important;
        }

        /* RESULT */

        .resultCard {
          border: 1px solid #343438;
          border-radius: 11px;

          background:
            linear-gradient(
              180deg,
              #050505,
              #020202
            );

          padding: 8px;
        }

        .resultTitle {
          margin-top: 0;
        }

        .resultContent {
          display: grid;
          grid-template-columns: 1fr 82px;
          gap: 8px;
        }

        .scoreGroup,
        .resultGroup {
          min-height: 93px;

          border: 1px solid #252529;
          border-radius: 9px;

          padding: 8px;
        }

        .miniLabel {
          display: block;

          text-align: center;

          color: #a6a6aa;

          font-size: 9px;
          font-weight: 900;
          letter-spacing: .09em;

          margin-bottom: 5px;
        }

        .scoreInputs {
          display: grid;
          grid-template-columns: 1fr 21px 1fr;
          gap: 3px;

          align-items: end;
        }

        .scoreInputs label {
          display: flex;
          flex-direction: column;
          align-items: center;

          color: #919196;

          font-size: 8px;
          font-weight: 900;
          letter-spacing: .07em;
        }

        .scoreInputs label span {
          min-height: 15px;
        }

        .flyLabel {
          color: var(--purpleBright);
        }

        .scoreInputs input {
          width: 100%;
          height: 48px;

          margin-top: 3px;

          border: 1px solid #4a4a4f;
          border-radius: 7px;

          background: #0d0d0f;
          color: white;

          outline: none;

          text-align: center;

          font-size: 24px;
          font-weight: 900;
        }

        .scoreDash {
          height: 48px;

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 22px;
        }

        .resultGroup {
          display: flex;
          flex-direction: column;
        }

        .resultSquare {
          flex: 1;

          min-height: 55px;

          border: 1px solid #49494e;
          border-radius: 7px;

          background: #111113;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #777;

          font-size: 31px;
          font-weight: 900;
        }

        .resultSquare.win {
          color: white;
          background:
            linear-gradient(
              145deg,
              #007c20,
              #00c33b
            );

          border-color: var(--green);
        }

        .resultSquare.loss {
          color: white;

          background:
            linear-gradient(
              145deg,
              #7c0000,
              #ca0808
            );

          border-color: var(--red);
        }

        .resultSquare.tie {
          color: white;
          background: #313136;
        }

        .gameNotes {
          width: 100%;

          margin-top: 7px;
          padding: 8px 10px;

          border: 1px solid #29292e;
          border-radius: 8px;

          background: #080809;
          color: white;

          resize: vertical;
          outline: none;

          font-size: 10px;
        }

        .gameNotes::placeholder {
          color: #55555a;
          letter-spacing: .06em;
        }

        .completeGame {
          width: 100%;
          min-height: 63px;

          margin-top: 7px;

          border: 1.5px solid #9648ef;
          border-radius: 9px;

          background:
            linear-gradient(
              125deg,
              #351061 0%,
              #7026ae 53%,
              #42106f 100%
            );

          color: white;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          cursor: pointer;

          box-shadow:
            inset 0 0 20px rgba(255,255,255,.07),
            0 0 16px rgba(124,42,200,.2);
        }

        .completeGame strong {
          font-size: 17px;
          font-weight: 900;
          letter-spacing: .08em;
        }

        .completeGame span {
          margin-top: 4px;

          font-size: 9px;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .completeGame:active {
          transform: scale(.985);

          filter: brightness(1.22);

          box-shadow:
            0 0 25px var(--purpleGlow),
            inset 0 0 25px rgba(255,255,255,.12);
        }

        .completeGame:disabled {
          opacity: .6;
        }

        /* MOBILE */

        @media (max-width: 430px) {
          .page {
            padding-left: 7px;
            padding-right: 7px;
          }

          .phoneApp {
            max-width: none;
          }

          .topHeader {
            grid-template-columns: 42px 1fr 42px;
            min-height: 56px;
          }

          .backButton,
          .hapticButton {
            width: 40px;
            height: 40px;
          }

          .identity {
            gap: 8px;
            font-size: 18px;
          }

          .identity b {
            font-size: 16px;
          }

          .statusBar {
            min-height: 54px;
          }

          .gameStatus {
            font-size: 17px;
          }

          .gameDot {
            width: 14px;
            height: 14px;
          }

          .gameClock strong {
            font-size: 30px;
          }

          .gameMeta {
            grid-template-columns: 1fr 115px;
          }

          .dateInput {
            width: 115px;
            font-size: 9px;
          }

          .statButton {
            min-height: 64px;
          }

          .statButton strong {
            font-size: 32px;
          }

          .otherStat {
            min-height: 52px;
          }

          .otherStat strong {
            font-size: 19px;
          }

          .subButton {
            min-height: 63px;
          }
        }

        /* VERY SMALL PHONES */

        @media (max-width: 360px) {
          .identity {
            font-size: 16px;
          }

          .primaryLine strong {
            font-size: 18px;
          }

          .shootingLine {
            gap: 3px 8px;
            font-size: 8px;
          }

          .statButton {
            min-height: 59px;
          }

          .statButton strong {
            font-size: 29px;
          }

          .otherStat strong {
            font-size: 17px;
          }

          .subButton strong {
            font-size: 11px;
          }
        }
      `}</style>
    </main>
  );
}
