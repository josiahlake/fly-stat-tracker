"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/* =========================================================
   FLIGHT PATH — LIVE GAME TRACKER
   ========================================================= */

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
  | { kind: "inc"; key: keyof LiveCounts }
  | { kind: "dec"; key: keyof LiveCounts };

type GameDraft = {
  updatedAt: number;
  date: string;
  opponent: string;
  notes: string;
  counts: LiveCounts;
};

type PlayerContext = {
  firstName: string;
  lastName: string;
  fullName: string;

  jerseyNumber: string;
  teamName: string;
  seasonName: string;

  membershipId: string | null;
};

type GameTrackerProps = {
  playerId: string;
  onGameSaved?: () => void;
  onExitGame?: () => void;
};

type SaveState = "saved" | "saving" | "error";

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

/* =========================================================
   HELPERS
   ========================================================= */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`;
}

function pct(made: number, attempts: number) {
  if (!attempts) return 0;
  return (made / attempts) * 100;
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function clampNonNeg(value: number) {
  return Math.max(0, value);
}

function formatPlayerName(firstName: string, lastName: string) {
  return `${firstName || ""} ${lastName || ""}`.trim();
}

function hasAnyStats(counts: LiveCounts) {
  return Object.values(counts).some((value) => Number(value) > 0);
}

/* =========================================================
   SMALL UI COMPONENTS
   ========================================================= */

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="fpStatTile">
      <div className="fpStatLabel">{label}</div>
      <div className="fpStatValue">{value}</div>

      {detail ? <div className="fpStatDetail">{detail}</div> : null}
    </div>
  );
}

function TapButton({
  id,
  activeId,
  onTap,
  title,
  subtitle,
  variant,
}: {
  id: string;
  activeId: string | null;
  onTap: () => void;
  title: string;
  subtitle: string;
  variant: "make" | "miss" | "neutral";
}) {
  const className = [
    "fpTapButton",
    variant === "make" ? "fpTapMake" : "",
    variant === "miss" ? "fpTapMiss" : "",
    variant === "neutral" ? "fpTapNeutral" : "",
    activeId === id ? "fpTapActive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={className} type="button" onClick={onTap}>
      <div className="fpTapTitle">{title}</div>
      <div className="fpTapSubtitle">{subtitle}</div>
    </button>
  );
}

/* =========================================================
   TRACKER
   ========================================================= */

export default function GameTracker({
  playerId,
  onGameSaved,
  onExitGame,
}: GameTrackerProps) {
  /* ---------------------------------------------------------
     PLAYER
     --------------------------------------------------------- */

  const [player, setPlayer] = useState<PlayerContext>({
    firstName: "",
    lastName: "",
    fullName: "",
    jerseyNumber: "",
    teamName: "",
    seasonName: "",
    membershipId: null,
  });

  const [playerLoading, setPlayerLoading] = useState(true);
  const [playerError, setPlayerError] = useState("");

  /* ---------------------------------------------------------
     GAME
     --------------------------------------------------------- */

  const [date, setDate] = useState(todayISO());
  const [opponent, setOpponent] = useState("");
  const [notes, setNotes] = useState("");

  const [counts, setCounts] = useState<LiveCounts>({
    ...emptyCounts,
  });

  /* ---------------------------------------------------------
     UI STATE
     --------------------------------------------------------- */

  const [history, setHistory] = useState<Action[]>([]);
  const [lastTapId, setLastTapId] = useState<string | null>(null);

  const [vibOn, setVibOn] = useState(true);

  const [draftReady, setDraftReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [manualSaveMessage, setManualSaveMessage] = useState("");

  const [finalizing, setFinalizing] = useState(false);

  const draftTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const tapTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const messageTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const DRAFT_KEY = `flightPath.gameDraft.${playerId}`;

  /* =========================================================
     LOAD PLAYER CONTEXT
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerContext() {
      setPlayerLoading(true);
      setPlayerError("");

      try {
        /*
         * 1. PLAYER PROFILE
         */
        const {
          data: playerRow,
          error: playerQueryError,
        } = await supabase
          .from("flight_players")
          .select("id, first_name, last_name")
          .eq("id", playerId)
          .single();

        if (playerQueryError) {
          throw playerQueryError;
        }

        /*
         * 2. MOST RECENT TEAM MEMBERSHIP
         */
        const {
          data: membershipRows,
          error: membershipError,
        } = await supabase
          .from("flight_team_memberships")
          .select(
            "id, player_id, team_id, season_id, jersey_number"
          )
          .eq("player_id", playerId)
          .limit(10);

        if (membershipError) {
          console.error(
            "Could not load Flight Path membership:",
            membershipError
          );
        }

        const membership =
          membershipRows && membershipRows.length > 0
            ? membershipRows[0]
            : null;

        let teamName = "";
        let seasonName = "";

        /*
         * 3. TEAM
         */
        if (membership?.team_id) {
          const { data: teamRow, error: teamError } =
            await supabase
              .from("teams")
              .select("id, name")
              .eq("id", membership.team_id)
              .maybeSingle();

          if (teamError) {
            console.error(
              "Could not load Flight Path team:",
              teamError
            );
          }

          teamName = teamRow?.name || "";
        }

        /*
         * 4. SEASON
         */
        if (membership?.season_id) {
          const { data: seasonRow, error: seasonError } =
            await supabase
              .from("seasons")
              .select("id, name")
              .eq("id", membership.season_id)
              .maybeSingle();

          if (seasonError) {
            console.error(
              "Could not load Flight Path season:",
              seasonError
            );
          }

          seasonName = seasonRow?.name || "";
        }

        if (cancelled) return;

        const firstName = playerRow?.first_name || "";
        const lastName = playerRow?.last_name || "";

        setPlayer({
          firstName,
          lastName,

          fullName:
            formatPlayerName(firstName, lastName) || "PLAYER",

          jerseyNumber:
            membership?.jersey_number !== null &&
            membership?.jersey_number !== undefined
              ? String(membership.jersey_number)
              : "",

          teamName,
          seasonName,

          membershipId: membership?.id
            ? String(membership.id)
            : null,
        });
      } catch (error) {
        console.error(
          "Could not load Flight Path player context:",
          error
        );

        if (!cancelled) {
          setPlayerError("Unable to load player information.");
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

  /* =========================================================
     RESTORE UNFINISHED GAME
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        /*
         * Read local copy first.
         */
        let localDraft: GameDraft | null = null;

        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem(DRAFT_KEY);

            if (raw) {
              localDraft = JSON.parse(raw) as GameDraft;
            }
          } catch (error) {
            console.error(
              "Could not read local Flight Path draft:",
              error
            );
          }
        }

        /*
         * If signed out, local draft can still restore.
         */
        if (!user) {
          if (localDraft && !cancelled) {
            setDate(localDraft.date || todayISO());
            setOpponent(localDraft.opponent || "");
            setNotes(localDraft.notes || "");
            setCounts({
              ...emptyCounts,
              ...localDraft.counts,
            });
          }

          if (!cancelled) {
            setDraftReady(true);
          }

          return;
        }

        /*
         * Read cloud draft.
         */
        const {
          data: cloudDraft,
          error: cloudDraftError,
        } = await supabase
          .from("flight_game_drafts")
          .select("*")
          .eq("player_id", playerId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (cloudDraftError) {
          console.error(
            "Could not load cloud Flight Path draft:",
            cloudDraftError
          );
        }

        if (cancelled) return;

        const cloudUpdatedAt = cloudDraft?.updated_at
          ? new Date(cloudDraft.updated_at).getTime()
          : 0;

        const localUpdatedAt =
          localDraft?.updatedAt || 0;

        /*
         * Whichever copy is newest wins.
         */
        if (
          cloudDraft &&
          cloudUpdatedAt >= localUpdatedAt
        ) {
          setDate(
            cloudDraft.game_date || todayISO()
          );

          setOpponent(
            cloudDraft.opponent_name || ""
          );

          setNotes(
            cloudDraft.game_note || ""
          );

          setCounts({
            made2: cloudDraft.two_pt_made ?? 0,
            miss2: cloudDraft.two_pt_missed ?? 0,

            made3: cloudDraft.three_pt_made ?? 0,
            miss3: cloudDraft.three_pt_missed ?? 0,

            madeFT: cloudDraft.ft_made ?? 0,
            missFT: cloudDraft.ft_missed ?? 0,

            orb:
              cloudDraft.offensive_rebounds ?? 0,

            drb:
              cloudDraft.defensive_rebounds ?? 0,

            ast: cloudDraft.assists ?? 0,
            to: cloudDraft.turnovers ?? 0,
            stl: cloudDraft.steals ?? 0,
            pf: cloudDraft.fouls ?? 0,
          });
        } else if (localDraft) {
          setDate(
            localDraft.date || todayISO()
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

  /* =========================================================
     AUTO-SAVE LIVE GAME
     ========================================================= */

  useEffect(() => {
    if (!draftReady) return;

    const now = Date.now();

    const localDraft: GameDraft = {
      updatedAt: now,
      date,
      opponent,
      notes,
      counts: { ...counts },
    };

    /*
     * SAFETY SAVE #1:
     * Immediately persist on device after every change.
     */
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(localDraft)
        );
      } catch (error) {
        console.error(
          "Could not save local Flight Path draft:",
          error
        );
      }
    }

    /*
     * SAFETY SAVE #2:
     * Cloud backup after brief debounce.
     */
    setSaveState("saving");

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = setTimeout(
      async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (!user) {
            setSaveState("saved");
            return;
          }

          const { error } = await supabase
            .from("flight_game_drafts")
            .upsert(
              {
                player_id: playerId,
                user_id: user.id,

                game_date:
                  date || todayISO(),

                opponent_name:
                  opponent.trim(),

                game_note:
                  notes.trim() || null,

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
        } catch (error) {
          console.error(
            "Flight Path cloud draft sync failed:",
            error
          );

          /*
           * Local copy is still protected.
           */
          setSaveState("error");
        }
      },
      400
    );

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

  /* =========================================================
     DERIVED GAME STATS
     ========================================================= */

  const scoring = useMemo(() => {
    const fgm =
      counts.made2 + counts.made3;

    const fga =
      counts.made2 +
      counts.miss2 +
      counts.made3 +
      counts.miss3;

    const tpm =
      counts.made3;

    const tpa =
      counts.made3 +
      counts.miss3;

    const ftm =
      counts.madeFT;

    const fta =
      counts.madeFT +
      counts.missFT;

    const points =
      counts.made2 * 2 +
      counts.made3 * 3 +
      counts.madeFT;

    return {
      points,
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

  const rebounds =
    counts.orb + counts.drb;

  /* =========================================================
     TAP FEEDBACK
     ========================================================= */

  function tapFeedback(id: string) {
    setLastTapId(id);

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    tapTimerRef.current = setTimeout(
      () => setLastTapId(null),
      120
    );

    if (!vibOn) return;

    if (
      typeof navigator !== "undefined" &&
      "vibrate" in navigator
    ) {
      try {
        navigator.vibrate(12);
      } catch {
        // iOS Safari generally ignores vibration.
      }
    }
  }

  /* =========================================================
     STAT ACTIONS
     ========================================================= */

  function inc(
    key: keyof LiveCounts,
    tapId: string
  ) {
    tapFeedback(tapId);

    setCounts((current) => ({
      ...current,
      [key]: current[key] + 1,
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
    setHistory((currentHistory) => {
      if (!currentHistory.length) {
        return currentHistory;
      }

      const last =
        currentHistory[
          currentHistory.length - 1
        ];

      setCounts((currentCounts) => {
        if (last.kind === "inc") {
          return {
            ...currentCounts,

            [last.key]: clampNonNeg(
              currentCounts[last.key] - 1
            ),
          };
        }

        return {
          ...currentCounts,

          [last.key]:
            currentCounts[last.key] + 1,
        };
      });

      return currentHistory.slice(0, -1);
    });
  }

  function confirmUndo() {
    if (!history.length) return;

    const confirmed =
      window.confirm(
        "Undo your last stat entry?"
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
    if (
      !hasAnyStats(counts) &&
      history.length === 0
    ) {
      return;
    }

    const name =
      player.fullName || "this player";

    const confirmed =
      window.confirm(
        `Clear ${name}'s live game stats?\n\nThis cannot be undone.`
      );

    if (confirmed) {
      resetLive();
    }
  }

  /* =========================================================
     MANUAL "SAVE PROGRESS"
     ========================================================= */

  async function saveProgress() {
    try {
      setSaveState("saving");

      const now = Date.now();

      const localDraft: GameDraft = {
        updatedAt: now,
        date,
        opponent,
        notes,
        counts: { ...counts },
      };

      /*
       * Save instantly on this device.
       */
      if (typeof window !== "undefined") {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(localDraft)
        );
      }

      /*
       * Save instantly to cloud.
       */
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSaveState("saved");
        showManualSaveMessage(
          "Saved on this device."
        );
        return;
      }

      const { error } = await supabase
        .from("flight_game_drafts")
        .upsert(
          {
            player_id: playerId,
            user_id: user.id,

            game_date:
              date || todayISO(),

            opponent_name:
              opponent.trim(),

            game_note:
              notes.trim() || null,

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

      showManualSaveMessage(
        "Progress saved ✓"
      );
    } catch (error) {
      console.error(
        "Could not save game progress:",
        error
      );

      /*
       * Their local safety save should still exist.
       */
      setSaveState("error");

      showManualSaveMessage(
        "Saved on device. Cloud backup unavailable."
      );
    }
  }

  function showManualSaveMessage(
    message: string
  ) {
    setManualSaveMessage(message);

    if (messageTimerRef.current) {
      clearTimeout(
        messageTimerRef.current
      );
    }

    messageTimerRef.current =
      setTimeout(() => {
        setManualSaveMessage("");
      }, 2400);
  }

  /* =========================================================
     EXIT WITHOUT ENDING GAME
     ========================================================= */

  async function exitGame() {
    /*
     * Force a safety save before leaving.
     */
    await saveProgress();

    if (onExitGame) {
      onExitGame();
    }
  }

  /* =========================================================
     FINALIZE GAME
     ========================================================= */

  async function finalizeGame() {
    if (finalizing) return;

    if (!player.fullName) {
      alert(
        "We couldn't load the player profile. Please return to Flight Path and try again."
      );
      return;
    }

    if (!player.membershipId) {
      alert(
        "We couldn't identify this player's current team membership. Please return to Flight Path and try again."
      );
      return;
    }

    if (!opponent.trim()) {
      alert(
        "Please enter the opponent before finalizing the game."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Finalize ${player.fullName}'s game vs. ${opponent.trim()}?\n\nThe stats will be added to this player's Flight Path.`
      );

    if (!confirmed) return;

    setFinalizing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "You are no longer signed in."
        );
      }

      /*
       * -------------------------------------------------------
       * 1. CREATE COMPLETED GAME
       * -------------------------------------------------------
       */

      const {
        data: gameRow,
        error: gameError,
      } = await supabase
        .from("flight_games")
        .insert({
          player_id: playerId,

          team_membership_id:
            player.membershipId,

          created_by:
            user.id,

          game_date:
            date || todayISO(),

          opponent_name:
            opponent.trim(),

          game_note:
            notes.trim() || null,

          /*
           * Team score can be added later.
           */
          fly_score: null,
          opponent_score: null,
          result: null,

          completed_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();

      if (gameError) {
        throw gameError;
      }

      if (!gameRow?.id) {
        throw new Error(
          "Completed game was not created."
        );
      }

      /*
       * -------------------------------------------------------
       * 2. CREATE GAME STATS
       * -------------------------------------------------------
       */

      const {
        error: statsError,
      } = await supabase
        .from("flight_game_stats")
        .insert({
          game_id:
            gameRow.id,

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
         * Best-effort cleanup so we don't leave
         * an empty completed game.
         */
        try {
          await supabase
            .from("flight_games")
            .delete()
            .eq("id", gameRow.id);
        } catch {
          // Preserve original error below.
        }

        throw statsError;
      }

      /*
       * -------------------------------------------------------
       * 3. DELETE CLOUD DRAFT
       * -------------------------------------------------------
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
       * -------------------------------------------------------
       * 4. DELETE LOCAL DRAFT
       * -------------------------------------------------------
       */

      if (typeof window !== "undefined") {
        localStorage.removeItem(
          DRAFT_KEY
        );
      }

      /*
       * -------------------------------------------------------
       * 5. CLEAR LIVE TRACKER
       * -------------------------------------------------------
       */

      setCounts({
        ...emptyCounts,
      });

      setHistory([]);
      setNotes("");
      setOpponent("");

      /*
       * -------------------------------------------------------
       * 6. RETURN TO PLAYER HOME
       * -------------------------------------------------------
       */

      if (onGameSaved) {
        onGameSaved();
      }
    } catch (error) {
      console.error(
        "Could not finalize Flight Path game:",
        error
      );

      alert(
        "We couldn't finalize the game. Your live stats are still saved, so nothing has been lost. Please try again."
      );
    } finally {
      setFinalizing(false);
    }
  }

  /* =========================================================
     DISPLAY VALUES
     ========================================================= */

  const playerHeading = playerLoading
    ? "LOADING PLAYER..."
    : player.fullName || "PLAYER";

  const jerseyDisplay =
    player.jerseyNumber
      ? ` · #${player.jerseyNumber}`
      : "";

  const teamSeasonLine = [
    player.teamName,
    player.seasonName,
  ]
    .filter(Boolean)
    .join(" · ");

  const saveLabel =
    saveState === "saving"
      ? "SAVING..."
      : saveState === "error"
      ? "SAVED ON DEVICE"
      : "AUTO-SAVED ✓";

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <main className="fpPage">
      <div className="fpShell">
        {/* =====================================================
            TOP NAV
            ===================================================== */}

        <div className="fpTopNav">
          <button
            type="button"
            className="fpBackButton"
            onClick={exitGame}
          >
            ← FLIGHT PATH
          </button>

          <button
            type="button"
            className="fpVibrationButton"
            onClick={() =>
              setVibOn((current) => !current)
            }
          >
            VIB: {vibOn ? "ON" : "OFF"}
          </button>
        </div>

        {/* =====================================================
            BRAND
            ===================================================== */}

        <header className="fpHeader">
          <div className="fpEyebrow">
            THE FLY ACADEMY
          </div>

          <div className="fpBrand">
            FLIGHT PATH
          </div>

          <div className="fpTagline">
            Track your game. See your journey.
          </div>
        </header>

        {/* =====================================================
            PLAYER / GAME IDENTITY
            ===================================================== */}

        <section className="fpIdentityCard">
          <div className="fpIdentityTop">
            <div>
              <div className="fpSectionEyebrow">
                GAME IN PROGRESS
              </div>

              <h1 className="fpPlayerName">
                {playerHeading}
                {jerseyDisplay}
              </h1>

              <div className="fpMembership">
                {teamSeasonLine ||
                  "Loading team information..."}
              </div>
            </div>

            <div className="fpSaveStatus">
              {saveLabel}
            </div>
          </div>

          {playerError ? (
            <div className="fpError">
              {playerError}
            </div>
          ) : null}

          <div className="fpGameMetaGrid">
            <div className="fpMetaField">
              <label className="fpMetaLabel">
                OPPONENT
              </label>

              <div className="fpOpponentWrap">
                <span className="fpVs">
                  VS.
                </span>

                <input
                  className="fpMetaInput"
                  value={opponent}
                  onChange={(event) =>
                    setOpponent(
                      event.target.value
                    )
                  }
                  placeholder="Opponent"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="fpMetaField">
              <label className="fpMetaLabel">
                GAME DATE
              </label>

              <input
                className="fpMetaInput fpDateInput"
                value={date}
                onChange={(event) =>
                  setDate(
                    event.target.value
                  )
                }
                type="date"
              />
            </div>
          </div>
        </section>

        {/* =====================================================
            LIVE SUMMARY
            ===================================================== */}

        <section className="fpSummaryCard">
          <div className="fpPrimaryStats">
            <StatTile
              label="PTS"
              value={scoring.points}
            />

            <StatTile
              label="REB"
              value={rebounds}
            />

            <StatTile
              label="AST"
              value={counts.ast}
            />

            <StatTile
              label="STL"
              value={counts.stl}
            />
          </div>

          <div className="fpShootingLine">
            <span>
              FG{" "}
              <strong>
                {scoring.fgm}-
                {scoring.fga}
              </strong>
            </span>

            <span className="fpDot">
              ·
            </span>

            <span>
              3PT{" "}
              <strong>
                {scoring.tpm}-
                {scoring.tpa}
              </strong>
            </span>

            <span className="fpDot">
              ·
            </span>

            <span>
              FT{" "}
              <strong>
                {scoring.ftm}-
                {scoring.fta}
              </strong>
            </span>
          </div>

          <div className="fpSecondaryStats">
            <StatTile
              label="FG%"
              value={formatPct(
                scoring.fgPct
              )}
            />

            <StatTile
              label="3PT%"
              value={formatPct(
                scoring.tpPct
              )}
            />

            <StatTile
              label="FT%"
              value={formatPct(
                scoring.ftPct
              )}
            />

            <StatTile
              label="TO"
              value={counts.to}
            />
          </div>
        </section>

        {/* =====================================================
            TRACKING CONTROLS
            ===================================================== */}

        <section className="fpTrackerCard">
          <div className="fpTrackerHeader">
            <div>
              <div className="fpSectionEyebrow">
                LIVE TRACKER
              </div>

              <h2 className="fpTrackerTitle">
                Tap the game.
              </h2>

              <div className="fpTrackerSub">
                Every tap is automatically
                protected.
              </div>
            </div>

            <div className="fpUndoReset">
              <button
                type="button"
                className="fpUtilityButton"
                onClick={confirmUndo}
                disabled={
                  history.length === 0
                }
              >
                UNDO
              </button>

              <button
                type="button"
                className="fpUtilityButton"
                onClick={confirmReset}
              >
                RESET
              </button>
            </div>
          </div>

          {/* ---------------------------------------------------
              SCORING
              --------------------------------------------------- */}

          <div className="fpGroupLabel">
            SCORING
          </div>

          <div className="fpScoringGrid">
            <TapButton
              id="made2"
              activeId={lastTapId}
              title="+2"
              subtitle="MADE 2PT"
              variant="make"
              onTap={() =>
                inc("made2", "made2")
              }
            />

            <TapButton
              id="miss2"
              activeId={lastTapId}
              title="2 MISS"
              subtitle="MISSED 2PT"
              variant="miss"
              onTap={() =>
                inc("miss2", "miss2")
              }
            />

            <TapButton
              id="made3"
              activeId={lastTapId}
              title="+3"
              subtitle="MADE 3PT"
              variant="make"
              onTap={() =>
                inc("made3", "made3")
              }
            />

            <TapButton
              id="miss3"
              activeId={lastTapId}
              title="3 MISS"
              subtitle="MISSED 3PT"
              variant="miss"
              onTap={() =>
                inc("miss3", "miss3")
              }
            />

            <TapButton
              id="madeFT"
              activeId={lastTapId}
              title="+FT"
              subtitle="MADE FREE THROW"
              variant="make"
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
              title="FT MISS"
              subtitle="MISSED FREE THROW"
              variant="miss"
              onTap={() =>
                inc(
                  "missFT",
                  "missFT"
                )
              }
            />
          </div>

          {/* ---------------------------------------------------
              OTHER
              --------------------------------------------------- */}

          <div className="fpGroupLabel fpOtherLabel">
            HUSTLE + OTHER
          </div>

          <div className="fpOtherGrid">
            <TapButton
              id="orb"
              activeId={lastTapId}
              title="OREB"
              subtitle="OFFENSIVE REBOUND"
              variant="neutral"
              onTap={() =>
                inc("orb", "orb")
              }
            />

            <TapButton
              id="drb"
              activeId={lastTapId}
              title="DREB"
              subtitle="DEFENSIVE REBOUND"
              variant="neutral"
              onTap={() =>
                inc("drb", "drb")
              }
            />

            <TapButton
              id="ast"
              activeId={lastTapId}
              title="AST"
              subtitle="ASSIST"
              variant="neutral"
              onTap={() =>
                inc("ast", "ast")
              }
            />

            <TapButton
              id="stl"
              activeId={lastTapId}
              title="STL"
              subtitle="STEAL"
              variant="neutral"
              onTap={() =>
                inc("stl", "stl")
              }
            />

            <TapButton
              id="to"
              activeId={lastTapId}
              title="TO"
              subtitle="TURNOVER"
              variant="neutral"
              onTap={() =>
                inc("to", "to")
              }
            />

            <TapButton
              id="pf"
              activeId={lastTapId}
              title="FOUL"
              subtitle="PERSONAL FOUL"
              variant="neutral"
              onTap={() =>
                inc("pf", "pf")
              }
            />
          </div>

          {/* ---------------------------------------------------
              NOTES
              --------------------------------------------------- */}

          <div className="fpNotesWrap">
            <label className="fpGroupLabel">
              GAME NOTES
            </label>

            <textarea
              className="fpNotes"
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
              rows={3}
              placeholder="Optional..."
            />
          </div>
        </section>

        {/* =====================================================
            SAVE / FINALIZE
            ===================================================== */}

        <section className="fpFinishCard">
          <div className="fpFinishCopy">
            <div className="fpSectionEyebrow">
              YOUR GAME IS PROTECTED
            </div>

            <div className="fpFinishTitle">
              {saveState === "saving"
                ? "Saving your latest stats..."
                : saveState === "error"
                ? "Saved safely on this device."
                : "Auto-saved as you track."}
            </div>

            <div className="fpFinishText">
              Use Save Progress anytime you
              want an extra checkpoint. Finalize
              only when the game is over.
            </div>

            {manualSaveMessage ? (
              <div className="fpSaveMessage">
                {manualSaveMessage}
              </div>
            ) : null}
          </div>

          <div className="fpFinishActions">
            <button
              type="button"
              className="fpSaveProgressButton"
              onClick={saveProgress}
            >
              SAVE PROGRESS
            </button>

            <button
              type="button"
              className="fpFinalizeButton"
              onClick={finalizeGame}
              disabled={
                finalizing ||
                playerLoading
              }
            >
              {finalizing
                ? "FINALIZING..."
                : "FINALIZE GAME →"}
            </button>
          </div>
        </section>
      </div>

      {/* =======================================================
          STYLES
          ======================================================= */}

      <style>{`
        :root {
          --fp-bg: #050505;
          --fp-card: #0d0d0d;
          --fp-card-2: #101010;
          --fp-line: #292929;
          --fp-line-soft: #202020;

          --fp-white: #f7f7f7;
          --fp-text: #eeeeee;
          --fp-muted: #929292;
          --fp-muted-2: #686868;

          --fp-make: #6f9db9;
          --fp-make-active: #82b1cc;

          --fp-miss: #d8492f;
          --fp-miss-active: #ea563b;

          --fp-neutral: #181818;
          --fp-neutral-active: #252525;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          background: var(--fp-bg);
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .fpPage {
          min-height: 100vh;
          background: var(--fp-bg);
          color: var(--fp-text);
          font-family:
            Arial,
            Helvetica,
            sans-serif;

          padding:
            max(18px, env(safe-area-inset-top))
            18px
            max(36px, env(safe-area-inset-bottom));
        }

        .fpShell {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
        }

        /* =====================================================
           NAV
           ===================================================== */

        .fpTopNav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;

          margin-bottom: 28px;
        }

        .fpBackButton,
        .fpVibrationButton {
          appearance: none;

          background: transparent;
          color: #8c8c8c;

          border: 1px solid #242424;
          border-radius: 999px;

          padding: 10px 13px;

          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;

          cursor: pointer;
        }

        .fpBackButton:hover,
        .fpVibrationButton:hover {
          color: white;
          border-color: #444;
        }

        /* =====================================================
           HEADER
           ===================================================== */

        .fpHeader {
          text-align: center;
          margin-bottom: 34px;
        }

        .fpEyebrow {
          color: #777;

          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.3em;

          margin-bottom: 10px;
        }

        .fpBrand {
          color: white;

          font-size: clamp(28px, 5vw, 40px);
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .fpTagline {
          color: #888;

          margin-top: 9px;

          font-size: 13px;
        }

        /* =====================================================
           COMMON CARDS
           ===================================================== */

        .fpIdentityCard,
        .fpSummaryCard,
        .fpTrackerCard,
        .fpFinishCard {
          background: var(--fp-card);

          border: 1px solid var(--fp-line);

          border-radius: 24px;
        }

        .fpIdentityCard {
          padding: 24px;
          margin-bottom: 14px;
        }

        .fpSummaryCard {
          padding: 16px;
          margin-bottom: 14px;
        }

        .fpTrackerCard {
          padding: 24px;
          margin-bottom: 14px;
        }

        .fpFinishCard {
          padding: 24px;
        }

        /* =====================================================
           IDENTITY
           ===================================================== */

        .fpIdentityTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .fpSectionEyebrow {
          color: #777;

          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.22em;

          text-transform: uppercase;
        }

        .fpPlayerName {
          color: white;

          margin:
            9px 0
            7px;

          font-size:
            clamp(
              25px,
              6vw,
              36px
            );

          line-height: 1;

          font-weight: 900;
          letter-spacing: -0.035em;

          text-transform: uppercase;
        }

        .fpMembership {
          color: #969696;

          font-size: 13px;
          line-height: 1.5;
        }

        .fpSaveStatus {
          color: #777;

          font-size: 9px;
          letter-spacing: 0.12em;
          font-weight: 800;

          white-space: nowrap;
        }

        .fpError {
          margin-top: 14px;

          color: #ff7a65;

          font-size: 12px;
        }

        .fpGameMetaGrid {
          margin-top: 24px;

          padding-top: 20px;

          border-top:
            1px solid
            var(--fp-line-soft);

          display: grid;
          grid-template-columns:
            1.4fr 0.8fr;

          gap: 12px;
        }

        .fpMetaField {
          min-width: 0;
        }

        .fpMetaLabel {
          display: block;

          margin-bottom: 7px;

          color: #696969;

          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }

        .fpOpponentWrap {
          display: flex;
          align-items: center;

          background: #141414;
          border: 1px solid #292929;
          border-radius: 14px;

          overflow: hidden;
        }

        .fpVs {
          color: #727272;

          padding-left: 12px;

          font-size: 11px;
          font-weight: 900;
        }

        .fpMetaInput {
          width: 100%;
          min-width: 0;

          background: #141414;
          color: white;

          border: 1px solid #292929;
          border-radius: 14px;

          padding: 13px;

          outline: none;

          font-size: 14px;
        }

        .fpOpponentWrap .fpMetaInput {
          border: none;
          border-radius: 0;

          padding-left: 8px;
        }

        .fpMetaInput:focus,
        .fpOpponentWrap:focus-within {
          border-color: #555;
        }

        .fpMetaInput::placeholder {
          color: #5d5d5d;
        }

        .fpDateInput {
          color-scheme: dark;
        }

        /* =====================================================
           SUMMARY
           ===================================================== */

        .fpPrimaryStats {
          display: grid;
          grid-template-columns:
            repeat(4, 1fr);

          gap: 8px;
        }

        .fpSecondaryStats {
          display: grid;
          grid-template-columns:
            repeat(4, 1fr);

          gap: 8px;

          margin-top: 8px;
        }

        .fpStatTile {
          min-width: 0;

          background: var(--fp-card-2);

          border: 1px solid
            var(--fp-line-soft);

          border-radius: 16px;

          padding: 13px;
        }

        .fpStatLabel {
          color: #6d6d6d;

          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.16em;

          white-space: nowrap;
        }

        .fpStatValue {
          color: white;

          margin-top: 5px;

          font-size:
            clamp(
              20px,
              4vw,
              27px
            );

          font-weight: 900;

          white-space: nowrap;
        }

        .fpStatDetail {
          color: #6c6c6c;

          margin-top: 3px;

          font-size: 9px;
        }

        .fpShootingLine {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;

          color: #8c8c8c;

          padding:
            13px 3px
            5px;

          font-size: 11px;
        }

        .fpShootingLine strong {
          color: #c8c8c8;
        }

        .fpDot {
          color: #484848;
        }

        /* =====================================================
           TRACKER
           ===================================================== */

        .fpTrackerHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;

          gap: 14px;

          margin-bottom: 24px;
        }

        .fpTrackerTitle {
          color: white;

          margin:
            8px 0
            5px;

          font-size: 24px;

          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .fpTrackerSub {
          color: #777;
          font-size: 12px;
        }

        .fpUndoReset {
          display: flex;
          gap: 6px;
        }

        .fpUtilityButton {
          appearance: none;

          background: #151515;
          color: #8d8d8d;

          border: 1px solid
            #282828;

          border-radius: 999px;

          padding: 9px 11px;

          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;

          cursor: pointer;
        }

        .fpUtilityButton:disabled {
          opacity: 0.32;
          cursor: default;
        }

        .fpGroupLabel {
          display: block;

          color: #727272;

          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.18em;

          text-transform: uppercase;
        }

        .fpOtherLabel {
          margin-top: 26px;
        }

        .fpScoringGrid {
          margin-top: 10px;

          display: grid;
          grid-template-columns:
            1fr 1fr;

          gap: 10px;
        }

        .fpOtherGrid {
          margin-top: 10px;

          display: grid;
          grid-template-columns:
            repeat(3, 1fr);

          gap: 10px;
        }

        /* =====================================================
           TAP BUTTONS
           ===================================================== */

        .fpTapButton {
          appearance: none;

          width: 100%;

          border: none;
          border-radius: 18px;

          min-height: 92px;

          padding: 17px;

          text-align: left;

          cursor: pointer;

          user-select: none;
          -webkit-user-select: none;

          transition:
            transform 80ms ease,
            filter 100ms ease,
            background 100ms ease;
        }

        .fpTapMake {
          background: var(--fp-make);
          color: white;
        }

        .fpTapMiss {
          background: var(--fp-miss);
          color: white;
        }

        .fpTapNeutral {
          background:
            var(--fp-neutral);

          color: white;

          border:
            1px solid
            #303030;
        }

        .fpTapActive {
          transform: scale(0.975);
          filter: brightness(1.15);
        }

        .fpTapTitle {
          font-size:
            clamp(
              20px,
              4vw,
              26px
            );

          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .fpTapSubtitle {
          margin-top: 8px;

          font-size: 9px;
          font-weight: 800;

          letter-spacing: 0.08em;

          opacity: 0.72;
        }

        /* =====================================================
           NOTES
           ===================================================== */

        .fpNotesWrap {
          margin-top: 26px;
        }

        .fpNotes {
          width: 100%;

          margin-top: 9px;

          resize: vertical;

          background: #141414;
          color: white;

          border: 1px solid #292929;
          border-radius: 16px;

          padding: 14px;

          outline: none;

          font-size: 13px;
          line-height: 1.5;
        }

        .fpNotes:focus {
          border-color: #4c4c4c;
        }

        .fpNotes::placeholder {
          color: #555;
        }

        /* =====================================================
           FINISH
           ===================================================== */

        .fpFinishCard {
          display: flex;
          justify-content: space-between;
          align-items: center;

          gap: 22px;
        }

        .fpFinishCopy {
          flex: 1;
          min-width: 0;
        }

        .fpFinishTitle {
          color: white;

          margin-top: 8px;

          font-size: 17px;
          font-weight: 800;
        }

        .fpFinishText {
          max-width: 400px;

          margin-top: 5px;

          color: #777;

          font-size: 11px;
          line-height: 1.5;
        }

        .fpSaveMessage {
          display: inline-block;

          margin-top: 11px;

          padding: 7px 10px;

          background: #161616;

          border: 1px solid #303030;
          border-radius: 999px;

          color: #a4a4a4;

          font-size: 10px;
          font-weight: 700;
        }

        .fpFinishActions {
          display: flex;
          gap: 8px;

          flex-shrink: 0;
        }

        .fpSaveProgressButton,
        .fpFinalizeButton {
          appearance: none;

          border-radius: 14px;

          padding: 14px 16px;

          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.02em;

          cursor: pointer;
        }

        .fpSaveProgressButton {
          background: #161616;
          color: white;

          border: 1px solid #343434;
        }

        .fpFinalizeButton {
          background: white;
          color: black;

          border: 1px solid white;
        }

        .fpFinalizeButton:disabled {
          opacity: 0.45;
          cursor: default;
        }

        /* =====================================================
           TABLET / PHONE
           ===================================================== */

        @media (max-width: 640px) {
          .fpPage {
            padding-left: 12px;
            padding-right: 12px;
          }

          .fpTopNav {
            margin-bottom: 22px;
          }

          .fpHeader {
            margin-bottom: 26px;
          }

          .fpIdentityCard,
          .fpTrackerCard,
          .fpFinishCard {
            border-radius: 20px;
            padding: 18px;
          }

          .fpSummaryCard {
            border-radius: 20px;
            padding: 10px;
          }

          .fpIdentityTop {
            display: block;
          }

          .fpSaveStatus {
            margin-top: 13px;
          }

          .fpGameMetaGrid {
            grid-template-columns: 1fr;
          }

          .fpPrimaryStats,
          .fpSecondaryStats {
            grid-template-columns:
              repeat(4, 1fr);

            gap: 5px;
          }

          .fpStatTile {
            padding: 10px 8px;
            border-radius: 13px;
          }

          .fpStatValue {
            font-size: 21px;
          }

          .fpOtherGrid {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .fpTrackerHeader {
            display: block;
          }

          .fpUndoReset {
            margin-top: 14px;
          }

          .fpFinishCard {
            display: block;
          }

          .fpFinishActions {
            display: grid;
            grid-template-columns: 1fr;

            margin-top: 18px;
          }

          .fpSaveProgressButton,
          .fpFinalizeButton {
            width: 100%;

            padding: 16px;
          }
        }

        @media (max-width: 390px) {
          .fpPrimaryStats,
          .fpSecondaryStats {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .fpScoringGrid {
            gap: 8px;
          }

          .fpTapButton {
            min-height: 86px;
            padding: 14px;
          }

          .fpBackButton,
          .fpVibrationButton {
            font-size: 8px;
          }
        }
      `}</style>
    </main>
  );
}
