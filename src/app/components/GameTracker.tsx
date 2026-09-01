"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

  return `${d.getFullYear()}-${pad2(
    d.getMonth() + 1
  )}-${pad2(d.getDate())}`;
}


function clampNonNeg(n: number) {
  return Math.max(0, n);
}


function formatClock(totalSeconds: number) {
  const safe = Math.max(
    0,
    Math.floor(totalSeconds)
  );

  const minutes = Math.floor(
    safe / 60
  );

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

  /* -------------------------------------------------------
     PLAYER
  ------------------------------------------------------- */

  const [player, setPlayer] =
    useState<PlayerContext | null>(null);

  const [playerLoading, setPlayerLoading] =
    useState(true);

  const [playerError, setPlayerError] =
    useState("");


  /* -------------------------------------------------------
     GAME
  ------------------------------------------------------- */

  const [date, setDate] =
    useState(todayISO());

  const [opponent, setOpponent] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [flyScore, setFlyScore] =
    useState("");

  const [
    opponentScore,
    setOpponentScore,
  ] = useState("");


  /* -------------------------------------------------------
     STATS
  ------------------------------------------------------- */

  const [counts, setCounts] =
    useState<LiveCounts>({
      ...emptyCounts,
    });

  const [history, setHistory] =
    useState<Action[]>([]);

  const [
    lastTapId,
    setLastTapId,
  ] = useState<string | null>(null);


  /* -------------------------------------------------------
     PLAYING TIME
  ------------------------------------------------------- */

  const [
    playingSeconds,
    setPlayingSeconds,
  ] = useState(0);

  const [
    isInGame,
    setIsInGame,
  ] = useState(false);

  const [
    liveSegmentStartedAt,
    setLiveSegmentStartedAt,
  ] = useState<number | null>(null);

  const [
    displayedPlayingSeconds,
    setDisplayedPlayingSeconds,
  ] = useState(0);


  /* -------------------------------------------------------
     SAVE STATES
  ------------------------------------------------------- */

  const [
    draftReady,
    setDraftReady,
  ] = useState(false);

  const [
    saveState,
    setSaveState,
  ] = useState<
    | "idle"
    | "saving"
    | "saved"
    | "error"
  >("idle");

  const [
    finalizing,
    setFinalizing,
  ] = useState(false);

  const [
    vibOn,
    setVibOn,
  ] = useState(true);


  /* -------------------------------------------------------
     REFS
  ------------------------------------------------------- */

  const draftTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const saveStatusTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const DRAFT_KEY =
    `flightPath.gameDraft.${playerId}`;


  /* =========================================================
     LOAD PLAYER CONTEXT
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayer() {
      setPlayerLoading(true);
      setPlayerError("");

      try {
        const {
          data: playerRecord,
          error: playerError,
        } = await supabase
          .from("flight_players")
          .select(
            "id, first_name, last_name"
          )
          .eq("id", playerId)
          .single();

        if (playerError) {
          throw playerError;
        }

        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from(
            "flight_team_memberships"
          )
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
            membership?.jersey_number ??
            null,

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
          "Unable to load player:",
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
        } =
          await supabase.auth.getUser();

        let localDraft:
          | GameDraft
          | null = null;

        /*
         * LOCAL COPY
         */

        if (
          typeof window !== "undefined"
        ) {

          try {

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

          } catch (error) {

            console.error(
              "Unable to read local draft:",
              error
            );
          }
        }


        /*
         * CLOUD COPY
         */

        let cloudDraft: any = null;

        if (user) {

          const {
            data,
            error,
          } = await supabase
            .from(
              "flight_game_drafts"
            )
            .select("*")
            .eq(
              "player_id",
              playerId
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

          if (error) {

            console.error(
              "Unable to load cloud draft:",
              error
            );

          } else {

            cloudDraft = data;
          }
        }

        if (cancelled) return;


        /*
         * COMPARE TIMESTAMPS
         */

        const cloudUpdatedAt =
          cloudDraft?.updated_at
            ? new Date(
                cloudDraft.updated_at
              ).getTime()
            : 0;

        const localUpdatedAt =
          localDraft?.updatedAt ?? 0;


        /*
         * LOCAL WINS
         *
         * Local contains additional UI state:
         * score + in/out state.
         */

        if (
          localDraft &&
          localUpdatedAt >=
            cloudUpdatedAt
        ) {

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

          setPlayingSeconds(
            localDraft.playingSeconds ??
              0
          );

          setIsInGame(
            localDraft.isInGame ??
              false
          );

          setLiveSegmentStartedAt(
            localDraft.liveSegmentStartedAt ??
              null
          );

          setFlyScore(
            localDraft.flyScore ?? ""
          );

          setOpponentScore(
            localDraft.opponentScore ??
              ""
          );

        }

        /*
         * CLOUD WINS
         */

        else if (cloudDraft) {

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

            reb:
              (
                cloudDraft.offensive_rebounds ??
                0
              ) +
              (
                cloudDraft.defensive_rebounds ??
                0
              ),

            ast:
              cloudDraft.assists ?? 0,

            to:
              cloudDraft.turnovers ?? 0,

            stl:
              cloudDraft.steals ?? 0,

            blk:
              cloudDraft.blocks ?? 0,

            pf:
              cloudDraft.fouls ?? 0,
          });

          setPlayingSeconds(
            cloudDraft.playing_seconds ??
              0
          );

          /*
           * Cloud recovery resumes in
           * SUBBED OUT state for safety.
           */

          setIsInGame(false);

          setLiveSegmentStartedAt(
            null
          );
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

  }, [
    playerId,
    DRAFT_KEY,
  ]);


  /* =========================================================
     PLAYING TIME CLOCK
  ========================================================= */

  useEffect(() => {

    function calculateCurrentTime() {

      let total =
        playingSeconds;

      if (
        isInGame &&
        liveSegmentStartedAt
      ) {

        total += Math.floor(
          (
            Date.now() -
            liveSegmentStartedAt
          ) / 1000
        );
      }

      setDisplayedPlayingSeconds(
        total
      );
    }

    calculateCurrentTime();

    if (!isInGame) {
      return;
    }

    const timer =
      window.setInterval(
        calculateCurrentTime,
        1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };

  }, [
    playingSeconds,
    isInGame,
    liveSegmentStartedAt,
  ]);


  /* =========================================================
     DERIVED LIVE STATS
  ========================================================= */

  const liveStats = useMemo(() => {

    const fgm =
      counts.made2 +
      counts.made3;

    const fga =
      counts.made2 +
      counts.miss2 +
      counts.made3 +
      counts.miss3;

    const threeAttempts =
      counts.made3 +
      counts.miss3;

    const ftAttempts =
      counts.madeFT +
      counts.missFT;

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

      threeMade:
        counts.made3,

      threeAttempts,

      ftMade:
        counts.madeFT,

      ftAttempts,
    };

  }, [counts]);


  /* =========================================================
     SAVE HELPERS
  ========================================================= */

  function getCurrentPlayingSeconds() {

    if (
      isInGame &&
      liveSegmentStartedAt
    ) {

      return (
        playingSeconds +
        Math.floor(
          (
            Date.now() -
            liveSegmentStartedAt
          ) / 1000
        )
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

      playingSeconds:
        getCurrentPlayingSeconds(),

      isInGame,

      liveSegmentStartedAt,

      flyScore,

      opponentScore,
    };
  }


  function saveLocalDraft() {

    if (
      typeof window === "undefined"
    ) {
      return;
    }

    try {

      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify(
          makeLocalDraft()
        )
      );

    } catch (error) {

      console.error(
        "Unable to save local draft:",
        error
      );
    }
  }


  async function saveCloudDraft() {

    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      throw new Error(
        "Please sign in again."
      );
    }

    const {
      error,
    } = await supabase
      .from(
        "flight_game_drafts"
      )
      .upsert(
        {
          player_id:
            playerId,

          user_id:
            user.id,

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

          /*
           * Current schema has
           * OREB + DREB.
           *
           * Tracker now keeps the
           * parent workflow simple:
           * one REB button.
           *
           * Store all rebounds as
           * defensive for now so
           * total rebounds remain
           * accurate.
           */

          offensive_rebounds: 0,

          defensive_rebounds:
            counts.reb,

          assists:
            counts.ast,

          steals:
            counts.stl,

          turnovers:
            counts.to,

          blocks:
            counts.blk,

          fouls:
            counts.pf,

          playing_seconds:
            getCurrentPlayingSeconds(),
        },
        {
          onConflict:
            "player_id,user_id",
        }
      );

    if (error) {
      throw error;
    }
  }


  /* =========================================================
     AUTOSAVE AFTER EVERY CHANGE
  ========================================================= */

  useEffect(() => {

    if (!draftReady) return;

    /*
     * Instant device save.
     */

    saveLocalDraft();

    /*
     * Debounced cloud save.
     */

    setSaveState("saving");

    if (draftTimerRef.current) {

      clearTimeout(
        draftTimerRef.current
      );
    }

    draftTimerRef.current =
      setTimeout(async () => {

        try {

          await saveCloudDraft();

          setSaveState("saved");

          if (
            saveStatusTimerRef.current
          ) {

            clearTimeout(
              saveStatusTimerRef.current
            );
          }

          saveStatusTimerRef.current =
            setTimeout(() => {

              setSaveState("idle");

            }, 1600);

        } catch (error) {

          console.error(
            "Autosave failed:",
            error
          );

          setSaveState("error");
        }

      }, 350);


    return () => {

      if (draftTimerRef.current) {

        clearTimeout(
          draftTimerRef.current
        );
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
     SAVE BEFORE PAGE IS HIDDEN
  ========================================================= */

  useEffect(() => {

    function emergencyLocalSave() {
      saveLocalDraft();
    }

    function handleVisibility() {

      if (
        document.visibilityState ===
        "hidden"
      ) {

        emergencyLocalSave();
      }
    }

    window.addEventListener(
      "pagehide",
      emergencyLocalSave
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );


    return () => {

      window.removeEventListener(
        "pagehide",
        emergencyLocalSave
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };

  });


  /* =========================================================
     TAP ACTIONS
  ========================================================= */

  function tapFeedback(
    id: string
  ) {

    setLastTapId(id);

    window.setTimeout(() => {
      setLastTapId(null);
    }, 120);

    if (
      vibOn &&
      typeof navigator !==
        "undefined" &&
      "vibrate" in navigator
    ) {

      navigator.vibrate(12);
    }
  }


  function increment(
    key: keyof LiveCounts,
    id: string
  ) {

    tapFeedback(id);

    setCounts((current) => ({
      ...current,

      [key]:
        current[key] + 1,
    }));

    setHistory((current) => [
      ...current,
      { key },
    ]);
  }


  function undo() {

    setHistory((current) => {

      if (!current.length) {
        return current;
      }

      const last =
        current[
          current.length - 1
        ];

      setCounts(
        (existing) => ({
          ...existing,

          [last.key]:
            clampNonNeg(
              existing[last.key] -
                1
            ),
        })
      );

      return current.slice(
        0,
        -1
      );
    });
  }


  /* =========================================================
     IN / OUT
  ========================================================= */

  function subIn() {

    if (isInGame) {
      return;
    }

    setLiveSegmentStartedAt(
      Date.now()
    );

    setIsInGame(true);

    tapFeedback("in-game");
  }


  function subOut() {

    if (
      !isInGame ||
      !liveSegmentStartedAt
    ) {
      return;
    }

    const segmentSeconds =
      Math.floor(
        (
          Date.now() -
          liveSegmentStartedAt
        ) / 1000
      );

    setPlayingSeconds(
      (current) =>
        current +
        segmentSeconds
    );

    setLiveSegmentStartedAt(
      null
    );

    setIsInGame(false);

    tapFeedback("subbed-out");
  }


  /* =========================================================
     MANUAL SAFETY SAVE
  ========================================================= */

  async function saveProgress() {

    try {

      setSaveState("saving");

      saveLocalDraft();

      await saveCloudDraft();

      setSaveState("saved");

      if (
        saveStatusTimerRef.current
      ) {

        clearTimeout(
          saveStatusTimerRef.current
        );
      }

      saveStatusTimerRef.current =
        setTimeout(() => {

          setSaveState("idle");

        }, 1800);

    } catch (error) {

      console.error(
        "Save Progress failed:",
        error
      );

      setSaveState("error");

      alert(
        "Your game is saved on this device, but we could not confirm the cloud save. Keep the tracker open and try Save Progress again."
      );
    }
  }


  /* =========================================================
     RESET
  ========================================================= */

  function resetGame() {

    const confirmed =
      window.confirm(
        "Reset this live game?\n\nThis will clear the current stats, score, playing time, opponent and notes."
      );

    if (!confirmed) return;

    setCounts({
      ...emptyCounts,
    });

    setHistory([]);

    setOpponent("");

    setNotes("");

    setFlyScore("");

    setOpponentScore("");

    setPlayingSeconds(0);

    setDisplayedPlayingSeconds(0);

    setIsInGame(false);

    setLiveSegmentStartedAt(
      null
    );

    setDate(todayISO());
  }


  /* =========================================================
     COMPLETE GAME
  ========================================================= */

  async function completeGame() {

    if (!player) {

      alert(
        "Player information is still loading."
      );

      return;
    }


    if (!player.membershipId) {

      alert(
        "We could not find this player's current team membership."
      );

      return;
    }


    const opponentName =
      opponent.trim();


    if (!opponentName) {

      alert(
        "Please enter the opponent before completing the game."
      );

      return;
    }


    if (
      flyScore.trim() === "" ||
      opponentScore.trim() === ""
    ) {

      alert(
        "Please enter the final score before completing the game."
      );

      return;
    }


    const flyFinal =
      Number(flyScore);

    const opponentFinal =
      Number(opponentScore);


    if (
      Number.isNaN(flyFinal) ||
      Number.isNaN(
        opponentFinal
      )
    ) {

      alert(
        "Please enter valid final scores."
      );

      return;
    }


    const result =
      flyFinal >
      opponentFinal
        ? "W"
        : flyFinal <
          opponentFinal
        ? "L"
        : "T";


    const fullName =
      `${player.firstName} ${player.lastName}`.trim();


    const confirmed =
      window.confirm(
        `Complete ${fullName}'s game vs. ${opponentName}?\n\n${result} ${flyFinal}-${opponentFinal}\n${liveStats.pts} PTS · ${liveStats.reb} REB · ${liveStats.ast} AST\n\nThis will save the final game to Flight Path.`
      );


    if (!confirmed) {
      return;
    }


    setFinalizing(true);


    try {

      /*
       * If player is currently
       * IN GAME, stop the final
       * active segment.
       */

      const finalPlayingSeconds =
        getCurrentPlayingSeconds();


      const {
        data: { user },
      } =
        await supabase.auth.getUser();


      if (!user) {

        throw new Error(
          "Please sign in again."
        );
      }


      /* -----------------------------------------------------
         CHECK GAME ACCESS
      ----------------------------------------------------- */

      const {
        data: entitlement,
        error: entitlementError,
      } = await supabase
        .from(
          "flight_entitlements"
        )
        .select(
          "id, games_total, games_used"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();


      if (entitlementError) {
        throw entitlementError;
      }


      if (!entitlement) {

        throw new Error(
          "No active game access was found for this account."
        );
      }


      const gamesTotal =
        entitlement.games_total ?? 0;

      const gamesUsed =
        entitlement.games_used ?? 0;


      if (
        gamesUsed >=
        gamesTotal
      ) {

        throw new Error(
          "There are no game credits remaining on this account."
        );
      }


      /* -----------------------------------------------------
         CREATE GAME
      ----------------------------------------------------- */

      const {
        data: game,
        error: gameError,
      } = await supabase
        .from(
          "flight_games"
        )
        .insert({
          player_id:
            playerId,

          team_membership_id:
            player.membershipId,

          created_by:
            user.id,

          game_date:
            date || todayISO(),

          opponent_name:
            opponentName,

          fly_score:
            flyFinal,

          opponent_score:
            opponentFinal,

          result,

          game_note:
            notes.trim() || null,

          completed_at:
            new Date().toISOString(),
        })
        .select("id")
        .single();


      if (gameError) {
        throw gameError;
      }


      /* -----------------------------------------------------
         CREATE STATS
      ----------------------------------------------------- */

      const {
        error: statsError,
      } = await supabase
        .from(
          "flight_game_stats"
        )
        .insert({
          game_id:
            game.id,

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
            counts.reb,

          assists:
            counts.ast,

          steals:
            counts.stl,

          turnovers:
            counts.to,

          blocks:
            counts.blk,

          fouls:
            counts.pf,

          playing_seconds:
            finalPlayingSeconds,
        });


      if (statsError) {

        await supabase
          .from(
            "flight_games"
          )
          .delete()
          .eq(
            "id",
            game.id
          );

        throw statsError;
      }


      /* -----------------------------------------------------
         CONSUME ONE GAME CREDIT
      ----------------------------------------------------- */

      const {
        error: creditError,
      } = await supabase
        .from(
          "flight_entitlements"
        )
        .update({
          games_used:
            gamesUsed + 1,
        })
        .eq(
          "id",
          entitlement.id
        );


      if (creditError) {

        /*
         * Roll completed game
         * back if credit update
         * does not succeed.
         */

        await supabase
          .from(
            "flight_game_stats"
          )
          .delete()
          .eq(
            "game_id",
            game.id
          );

        await supabase
          .from(
            "flight_games"
          )
          .delete()
          .eq(
            "id",
            game.id
          );

        throw creditError;
      }


      /* -----------------------------------------------------
         CLEAR CLOUD DRAFT
      ----------------------------------------------------- */

      const {
        error: draftDeleteError,
      } = await supabase
        .from(
          "flight_game_drafts"
        )
        .delete()
        .eq(
          "player_id",
          playerId
        )
        .eq(
          "user_id",
          user.id
        );


      if (draftDeleteError) {

        console.error(
          "Game completed, but draft cleanup failed:",
          draftDeleteError
        );
      }


      /* -----------------------------------------------------
         CLEAR LOCAL DRAFT
      ----------------------------------------------------- */

      if (
        typeof window !==
        "undefined"
      ) {

        localStorage.removeItem(
          DRAFT_KEY
        );
      }


      /* -----------------------------------------------------
         CLEAR LOCAL STATE
      ----------------------------------------------------- */

      setCounts({
        ...emptyCounts,
      });

      setHistory([]);

      setOpponent("");

      setNotes("");

      setFlyScore("");

      setOpponentScore("");

      setPlayingSeconds(0);

      setDisplayedPlayingSeconds(
        0
      );

      setLiveSegmentStartedAt(
        null
      );

      setIsInGame(false);

      setDate(todayISO());


      /* -----------------------------------------------------
         RETURN TO FLIGHT PATH
      ----------------------------------------------------- */

      if (onGameSaved) {

        onGameSaved();
      }


    } catch (error) {

      console.error(
        "Could not complete game:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "We couldn't complete the game. Your live game has not been intentionally cleared."
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
        LOADING FLIGHT PATH...
      </main>
    );
  }


  if (
    playerError ||
    !player
  ) {

    return (
      <main className="loading">

        <div>
          Unable to load player.
        </div>

      </main>
    );
  }


  const fullName =
    `${player.firstName} ${player.lastName}`.trim();


  const result =
    flyScore !== "" &&
    opponentScore !== ""
      ? Number(flyScore) >
        Number(opponentScore)
        ? "W"
        : Number(flyScore) <
          Number(opponentScore)
        ? "L"
        : "T"
      : null;


  const saveLabel =
    saveState === "saving"
      ? "SAVING..."
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

      <section className="tracker">


        {/* ===================================================
            HEADER
        =================================================== */}

        <div className="header">

          <button
            type="button"
            className="iconButton"
            onClick={
              onExitGame
            }
            aria-label="Back to Player Home"
          >
            ‹
          </button>


          <div className="playerTitle">

            {fullName.toUpperCase()}

            {player.jerseyNumber
              ? `  #${player.jerseyNumber}`
              : ""}

          </div>


          <div className="headerActions">

            <button
              className="smallAction"
              type="button"
              onClick={() =>
                setVibOn(
                  (current) =>
                    !current
                )
              }
            >
              VIB {vibOn ? "ON" : "OFF"}
            </button>

          </div>

        </div>


        {/* ===================================================
            STATUS
        =================================================== */}

        <div className="statusRow">

          <button
            className={`statusIndicator ${
              isInGame
                ? "statusActive"
                : ""
            }`}
            type="button"
            onClick={
              isInGame
                ? subOut
                : subIn
            }
          >

            <span className="statusDot" />

            {isInGame
              ? "IN GAME"
              : "SUBBED OUT"}

          </button>


          <div className="timeBlock">

            <div className="playingTime">

              {formatClock(
                displayedPlayingSeconds
              )}

            </div>

            <div className="timeLabel">

              PLAYING TIME

            </div>

          </div>

        </div>


        {/* ===================================================
            GAME IDENTITY
        =================================================== */}

        <div className="gameInfo">

          <div className="infoCell">

            <label>
              OPPONENT
            </label>

            <input
              value={opponent}
              onChange={(e) =>
                setOpponent(
                  e.target.value
                )
              }
              placeholder="Opponent"
            />

          </div>


          <div className="infoCell dateCell">

            <label>
              DATE
            </label>

            <input
              type="date"
              value={date}
              onChange={(e) =>
                setDate(
                  e.target.value
                )
              }
            />

          </div>

        </div>


        {/* ===================================================
            LIVE STAT SUMMARY
        =================================================== */}

        <div className="liveSummary">

          <div className="summaryHeader">

            <span>
              LIVE STATS
            </span>

            <span className={
              saveState === "error"
                ? "saveIssue"
                : ""
            }>
              {saveLabel}
            </span>

          </div>


          <div className="summaryPrimary">

            <div className="summaryStat">

              <strong>
                {liveStats.pts}
              </strong>

              <span>
                PTS
              </span>

            </div>


            <div className="summaryStat">

              <strong>
                {liveStats.reb}
              </strong>

              <span>
                REB
              </span>

            </div>


            <div className="summaryStat">

              <strong>
                {liveStats.ast}
              </strong>

              <span>
                AST
              </span>

            </div>


            <div className="summaryStat">

              <strong>
                {liveStats.stl}
              </strong>

              <span>
                STL
              </span>

            </div>

          </div>


          <div className="summarySecondary">

            <span>
              FG{" "}
              <b>
                {liveStats.fgm}-
                {liveStats.fga}
              </b>
            </span>

            <span>
              3PT{" "}
              <b>
                {liveStats.threeMade}-
                {liveStats.threeAttempts}
              </b>
            </span>

            <span>
              FT{" "}
              <b>
                {liveStats.ftMade}-
                {liveStats.ftAttempts}
              </b>
            </span>

            <span>
              TO{" "}
              <b>
                {liveStats.to}
              </b>
            </span>

            <span>
              BLK{" "}
              <b>
                {liveStats.blk}
              </b>
            </span>

            <span>
              FL{" "}
              <b>
                {liveStats.pf}
              </b>
            </span>

          </div>

        </div>


        {/* ===================================================
            2PT
        =================================================== */}

        <div className="statSection">

          <div className="sectionTitle">
            2-POINT FG
          </div>


          <div className="twoButtons">

            <button
              className={`makeButton ${
                lastTapId ===
                "made2"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "made2",
                  "made2"
                )
              }
            >

              <strong>
                +2
              </strong>

              <span>
                MAKE
              </span>

            </button>


            <button
              className={`missButton ${
                lastTapId ===
                "miss2"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "miss2",
                  "miss2"
                )
              }
            >

              <strong>
                Ø2
              </strong>

              <span>
                MISS
              </span>

            </button>

          </div>

        </div>


        {/* ===================================================
            3PT
        =================================================== */}

        <div className="statSection">

          <div className="sectionTitle">
            3-POINT FG
          </div>


          <div className="twoButtons">

            <button
              className={`makeButton ${
                lastTapId ===
                "made3"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "made3",
                  "made3"
                )
              }
            >

              <strong>
                +3
              </strong>

              <span>
                MAKE
              </span>

            </button>


            <button
              className={`missButton ${
                lastTapId ===
                "miss3"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "miss3",
                  "miss3"
                )
              }
            >

              <strong>
                Ø3
              </strong>

              <span>
                MISS
              </span>

            </button>

          </div>

        </div>


        {/* ===================================================
            FREE THROW
        =================================================== */}

        <div className="statSection">

          <div className="sectionTitle">
            FREE THROWS
          </div>


          <div className="twoButtons">

            <button
              className={`makeButton ${
                lastTapId ===
                "madeFT"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "madeFT",
                  "madeFT"
                )
              }
            >

              <strong>
                +1
              </strong>

              <span>
                MAKE
              </span>

            </button>


            <button
              className={`missButton ${
                lastTapId ===
                "missFT"
                  ? "tapFlash"
                  : ""
              }`}
              type="button"
              onClick={() =>
                increment(
                  "missFT",
                  "missFT"
                )
              }
            >

              <strong>
                Ø1
              </strong>

              <span>
                MISS
              </span>

            </button>

          </div>

        </div>


        {/* ===================================================
            OTHER STATS
        =================================================== */}

        <div className="otherStats">

          {[
            ["reb", "REB"],
            ["ast", "AST"],
            ["stl", "STL"],
            ["to", "TO"],
            ["blk", "BLK"],
            ["pf", "FL"],
          ].map(
            ([key, label]) => (

              <button
                key={key}
                type="button"
                className={`otherButton ${
                  lastTapId === key
                    ? "tapFlash"
                    : ""
                }`}
                onClick={() =>
                  increment(
                    key as keyof LiveCounts,
                    key
                  )
                }
              >

                <span>
                  {label}
                </span>

                <b>
                  {
                    counts[
                      key as keyof LiveCounts
                    ]
                  }
                </b>

              </button>
            )
          )}

        </div>


        {/* ===================================================
            PLAYING TIME
        =================================================== */}

        <div className="playingSection">

          <div className="sectionTitle">
            PLAYING TIME
          </div>


          <div className="playingButtons">

            <button
              className={`inButton ${
                isInGame
                  ? "playingSelected"
                  : ""
              }`}
              type="button"
              onClick={subIn}
            >

              <strong>
                🏃 IN GAME
              </strong>

              <span>
                TAP WHEN IN
              </span>

            </button>


            <button
              className={`outButton ${
                !isInGame
                  ? "outSelected"
                  : ""
              }`}
              type="button"
              onClick={subOut}
            >

              <strong>
                ♿ SUBBED OUT
              </strong>

              <span>
                TAP WHEN OUT
              </span>

            </button>

          </div>

        </div>


        {/* ===================================================
            SAFETY CONTROLS
        =================================================== */}

        <div className="safetyRow">

          <button
            type="button"
            className="utilityButton"
            disabled={
              !history.length
            }
            onClick={undo}
          >
            ↶ UNDO
          </button>


          <button
            type="button"
            className="utilityButton"
            onClick={
              saveProgress
            }
          >
            SAVE PROGRESS
          </button>


          <button
            type="button"
            className="utilityButton dangerUtility"
            onClick={resetGame}
          >
            RESET
          </button>

        </div>


        {/* ===================================================
            GAME RESULT
        =================================================== */}

        <div className="resultSection">

          <div className="sectionTitle">
            GAME RESULT
          </div>


          <div className="scoreArea">

            <div className="scoreBlock">

              <div className="scoreLabel">
                FLY
              </div>

              <input
                inputMode="numeric"
                value={flyScore}
                onChange={(e) =>
                  setFlyScore(
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                  )
                }
                placeholder="0"
              />

            </div>


            <div className="dash">
              –
            </div>


            <div className="scoreBlock">

              <div className="scoreLabel muted">
                OPPONENT
              </div>

              <input
                inputMode="numeric"
                value={
                  opponentScore
                }
                onChange={(e) =>
                  setOpponentScore(
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                  )
                }
                placeholder="0"
              />

            </div>


            <div className="resultBadge">

              <div className="scoreLabel">
                RESULT
              </div>

              <strong
                className={
                  result === "W"
                    ? "win"
                    : result === "L"
                    ? "loss"
                    : ""
                }
              >
                {result ?? "—"}
              </strong>

            </div>

          </div>


          <textarea
            className="notes"
            value={notes}
            onChange={(e) =>
              setNotes(
                e.target.value
              )
            }
            placeholder="Game note · optional"
            rows={2}
          />


          <button
            className="completeButton"
            type="button"
            onClick={
              completeGame
            }
            disabled={
              finalizing
            }
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

        </div>


      </section>


      {/* =====================================================
          STYLES
      ===================================================== */}

      <style>{`

        * {
          box-sizing: border-box;
        }


        button,
        input,
        textarea {
          font: inherit;
        }


        button {
          touch-action: manipulation;
          -webkit-tap-highlight-color:
            transparent;
        }


        .loading {

          min-height: 100vh;

          background: #000;

          color: #fff;

          display: flex;

          align-items: center;

          justify-content: center;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 12px;

          font-weight: 800;

          letter-spacing: .16em;
        }


        .page {

          min-height: 100vh;

          background:
            radial-gradient(
              circle at 50% 0%,
              #111 0,
              #050505 42%,
              #000 100%
            );

          color: #fff;

          padding:
            18px
            12px
            40px;

          font-family:
            Arial,
            Helvetica,
            sans-serif;
        }


        .tracker {

          width: 100%;

          max-width: 540px;

          margin:
            0 auto;
        }


        /* HEADER */

        .header {

          min-height: 58px;

          display: grid;

          grid-template-columns:
            48px
            1fr
            auto;

          gap: 8px;

          align-items: center;

          margin-bottom: 8px;
        }


        .iconButton {

          width: 44px;

          height: 44px;

          border: 0;

          background:
            transparent;

          color: #fff;

          font-size: 42px;

          line-height: 1;

          cursor: pointer;
        }


        .playerTitle {

          font-size:
            clamp(
              18px,
              5vw,
              25px
            );

          font-weight: 900;

          text-align: center;

          letter-spacing:
            .015em;

          white-space: nowrap;
        }


        .headerActions {

          display: flex;

          justify-content:
            flex-end;
        }


        .smallAction {

          border:
            1px solid
            #2f2f2f;

          background:
            #0c0c0c;

          color:
            #aaa;

          border-radius:
            999px;

          padding:
            8px 9px;

          font-size:
            9px;

          font-weight:
            800;

          cursor:
            pointer;
        }


        /* STATUS */

        .statusRow {

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          gap: 16px;

          margin:
            8px 10px
            12px;
        }


        .statusIndicator {

          display: flex;

          align-items:
            center;

          gap: 10px;

          padding: 0;

          border: 0;

          background:
            transparent;

          color:
            #888;

          font-weight:
            900;

          font-size:
            22px;

          letter-spacing:
            .04em;

          cursor:
            pointer;
        }


        .statusIndicator.statusActive {

          color:
            #12d83f;
        }


        .statusDot {

          width: 15px;

          height: 15px;

          border-radius:
            50%;

          background:
            #555;
        }


        .statusActive
        .statusDot {

          background:
            #12d83f;

          box-shadow:
            0 0 14px
            rgba(
              18,
              216,
              63,
              .45
            );
        }


        .timeBlock {

          text-align:
            right;
        }


        .playingTime {

          font-size:
            32px;

          font-weight:
            500;

          line-height:
            1;
        }


        .timeLabel {

          margin-top:
            5px;

          color:
            #aaa;

          font-size:
            10px;

          letter-spacing:
            .14em;

          font-weight:
            800;
        }


        /* GAME INFO */

        .gameInfo {

          display: grid;

          grid-template-columns:
            1fr
            138px;

          gap: 8px;

          margin-bottom:
            8px;
        }


        .infoCell {

          border:
            1px solid
            #2a2a2a;

          background:
            #090909;

          border-radius:
            12px;

          padding:
            8px 12px;
        }


        .infoCell label {

          display:
            block;

          color:
            #777;

          font-size:
            8px;

          font-weight:
            800;

          letter-spacing:
            .16em;

          margin-bottom:
            4px;
        }


        .infoCell input {

          width: 100%;

          border: 0;

          outline: 0;

          background:
            transparent;

          color: #fff;

          font-size:
            14px;

          font-weight:
            700;
        }


        /* LIVE SUMMARY */

        .liveSummary {

          border:
            1px solid
            #343434;

          border-radius:
            14px;

          background:
            linear-gradient(
              180deg,
              #101010,
              #080808
            );

          padding:
            9px 10px
            10px;

          margin-bottom:
            8px;
        }


        .summaryHeader {

          display: flex;

          justify-content:
            space-between;

          color:
            #888;

          font-size:
            8px;

          font-weight:
            900;

          letter-spacing:
            .15em;

          margin:
            0 4px
            7px;
        }


        .saveIssue {

          color:
            #ff4d4d;
        }


        .summaryPrimary {

          display: grid;

          grid-template-columns:
            repeat(
              4,
              1fr
            );

          border:
            1px solid
            #242424;

          border-radius:
            10px;

          overflow:
            hidden;
        }


        .summaryStat {

          min-height:
            49px;

          display: flex;

          flex-direction:
            column;

          align-items:
            center;

          justify-content:
            center;

          border-right:
            1px solid
            #242424;
        }


        .summaryStat:last-child {

          border-right:
            0;
        }


        .summaryStat strong {

          font-size:
            21px;

          line-height:
            1;

          font-weight:
            900;
        }


        .summaryStat span {

          margin-top:
            5px;

          color:
            #777;

          font-size:
            8px;

          letter-spacing:
            .12em;

          font-weight:
            800;
        }


        .summarySecondary {

          display: flex;

          flex-wrap: wrap;

          justify-content:
            center;

          gap:
            6px 14px;

          padding-top:
            8px;

          color:
            #888;

          font-size:
            10px;
        }


        .summarySecondary b {

          color:
            #fff;

          font-weight:
            800;
        }


        /* STAT SECTIONS */

        .statSection {

          border:
            1px solid
            #323232;

          border-radius:
            13px;

          padding:
            7px 9px
            9px;

          margin-bottom:
            7px;

          background:
            rgba(
              0,
              0,
              0,
              .5
            );
        }


        .sectionTitle {

          text-align:
            center;

          color:
            #f0f0f0;

          font-size:
            13px;

          font-weight:
            900;

          letter-spacing:
            .08em;

          margin-bottom:
            6px;
        }


        .twoButtons {

          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 8px;
        }


        .makeButton,
        .missButton {

          min-height:
            74px;

          border-radius:
            13px;

          color: #fff;

          cursor:
            pointer;

          display: flex;

          flex-direction:
            column;

          align-items:
            center;

          justify-content:
            center;

          transition:
            transform
            80ms ease,
            filter
            80ms ease;
        }


        .makeButton {

          border:
            2px solid
            #12df49;

          background:
            linear-gradient(
              135deg,
              #006c20,
              #0aa635
            );

          box-shadow:
            inset
            0 0 20px
            rgba(
              0,
              255,
              70,
              .13
            );
        }


        .missButton {

          border:
            2px solid
            #ff2626;

          background:
            linear-gradient(
              135deg,
              #970000,
              #e00808
            );

          box-shadow:
            inset
            0 0 20px
            rgba(
              255,
              30,
              30,
              .14
            );
        }


        .makeButton strong,
        .missButton strong {

          font-size:
            35px;

          line-height:
            .95;

          font-weight:
            900;
        }


        .makeButton span,
        .missButton span {

          margin-top:
            5px;

          font-size:
            12px;

          font-weight:
            900;

          letter-spacing:
            .05em;
        }


        .tapFlash {

          filter:
            brightness(
              1.35
            );

          transform:
            scale(.97);
        }


        /* OTHER STATS */

        .otherStats {

          display: grid;

          grid-template-columns:
            repeat(
              3,
              1fr
            );

          gap: 7px;

          margin:
            7px 1px
            10px;
        }


        .otherButton {

          min-height:
            61px;

          border:
            1px solid
            #777;

          border-radius:
            11px;

          background:
            linear-gradient(
              180deg,
              #111,
              #050505
            );

          color: #fff;

          cursor:
            pointer;

          display: flex;

          align-items:
            center;

          justify-content:
            center;

          gap: 8px;
        }


        .otherButton span {

          font-size:
            23px;

          font-weight:
            900;
        }


        .otherButton b {

          min-width:
            19px;

          height:
            19px;

          display: flex;

          align-items:
            center;

          justify-content:
            center;

          border-radius:
            999px;

          background:
            #292929;

          color:
            #bbb;

          font-size:
            9px;
        }


        /* PLAYING TIME */

        .playingSection {

          margin-top:
            4px;
        }


        .playingButtons {

          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 8px;
        }


        .inButton,
        .outButton {

          min-height:
            70px;

          border-radius:
            12px;

          color: #fff;

          cursor:
            pointer;

          display: flex;

          flex-direction:
            column;

          align-items:
            center;

          justify-content:
            center;
        }


        .inButton {

          border:
            1px solid
            #0eb93b;

          background:
            #073715;
        }


        .inButton.playingSelected {

          background:
            linear-gradient(
              135deg,
              #008727,
              #0ab83b
            );

          box-shadow:
            0 0 20px
            rgba(
              18,
              216,
              63,
              .18
            );
        }


        .outButton {

          border:
            1px solid
            #555;

          background:
            #141414;
        }


        .outButton.outSelected {

          background:
            #242424;
        }


        .inButton strong,
        .outButton strong {

          font-size:
            15px;

          font-weight:
            900;
        }


        .inButton span,
        .outButton span {

          margin-top:
            5px;

          font-size:
            9px;

          letter-spacing:
            .08em;
        }


        /* SAFETY */

        .safetyRow {

          display: grid;

          grid-template-columns:
            1fr 1.4fr 1fr;

          gap: 7px;

          margin:
            10px 0;
        }


        .utilityButton {

          min-height:
            39px;

          border:
            1px solid
            #3a3a3a;

          border-radius:
            9px;

          background:
            #101010;

          color:
            #ccc;

          font-size:
            9px;

          font-weight:
            900;

          letter-spacing:
            .07em;

          cursor:
            pointer;
        }


        .utilityButton:disabled {

          opacity:
            .3;
        }


        .dangerUtility {

          color:
            #b0b0b0;
        }


        /* RESULT */

        .resultSection {

          border:
            1px solid
            #303030;

          border-radius:
            14px;

          padding:
            10px;

          margin-top:
            7px;
        }


        .scoreArea {

          display: grid;

          grid-template-columns:
            1fr
            24px
            1fr
            72px;

          align-items:
            end;

          gap:
            5px;
        }


        .scoreBlock {

          text-align:
            center;
        }


        .scoreLabel {

          min-height:
            20px;

          color:
            #a641f4;

          font-size:
            9px;

          font-weight:
            900;

          letter-spacing:
            .08em;

          margin-bottom:
            5px;
        }


        .scoreLabel.muted {

          color:
            #aaa;
        }


        .scoreBlock input {

          width: 100%;

          height: 50px;

          border:
            1px solid
            #555;

          border-radius:
            9px;

          background:
            #111;

          color:
            #fff;

          text-align:
            center;

          font-size:
            25px;

          font-weight:
            900;

          outline:
            none;
        }


        .dash {

          height:
            50px;

          display: flex;

          align-items:
            center;

          justify-content:
            center;

          font-size:
            22px;
        }


        .resultBadge {

          text-align:
            center;
        }


        .resultBadge strong {

          height:
            50px;

          border:
            1px solid
            #555;

          border-radius:
            9px;

          display: flex;

          align-items:
            center;

          justify-content:
            center;

          background:
            #151515;

          font-size:
            27px;

          font-weight:
            900;
        }


        .resultBadge
        strong.win {

          background:
            #05952c;

          border-color:
            #11d447;
        }


        .resultBadge
        strong.loss {

          background:
            #8f0707;

          border-color:
            #e61f1f;
        }


        .notes {

          width: 100%;

          margin-top:
            8px;

          border:
            1px solid
            #333;

          border-radius:
            9px;

          background:
            #090909;

          color:
            #fff;

          padding:
            9px 11px;

          outline:
            none;

          resize:
            vertical;

          font-size:
            11px;
        }


        .completeButton {

          width: 100%;

          min-height:
            68px;

          margin-top:
            8px;

          border:
            1px solid
            #9a4aee;

          border-radius:
            11px;

          background:
            linear-gradient(
              135deg,
              #45117f,
              #7426b7
            );

          color: #fff;

          cursor:
            pointer;

          display:
            flex;

          flex-direction:
            column;

          align-items:
            center;

          justify-content:
            center;

          box-shadow:
            0 0 24px
            rgba(
              126,
              42,
              206,
              .18
            );
        }


        .completeButton strong {

          font-size:
            18px;

          letter-spacing:
            .06em;

          font-weight:
            900;
        }


        .completeButton span {

          margin-top:
            4px;

          font-size:
            10px;

          letter-spacing:
            .09em;

          font-weight:
            700;
        }


        .completeButton:disabled {

          opacity:
            .6;

          cursor:
            wait;
        }


        /* MOBILE */

        @media (
          max-width: 430px
        ) {

          .page {
            padding:
              10px
              8px
              30px;
          }


          .tracker {
            max-width:
              none;
          }


          .header {

            grid-template-columns:
              36px
              1fr
              48px;
          }


          .iconButton {

            width:
              34px;
          }


          .playerTitle {

            font-size:
              18px;
          }


          .smallAction {

            padding:
              7px 5px;

            font-size:
              7px;
          }


          .statusRow {

            margin-left:
              6px;

            margin-right:
              6px;
          }


          .statusIndicator {

            font-size:
              18px;
          }


          .playingTime {

            font-size:
              28px;
          }


          .gameInfo {

            grid-template-columns:
              1fr
              122px;
          }


          .summarySecondary {

            font-size:
              9px;

            gap:
              5px 10px;
          }


          .makeButton,
          .missButton {

            min-height:
              69px;
          }


          .makeButton strong,
          .missButton strong {

            font-size:
              31px;
          }


          .otherButton {

            min-height:
              57px;
          }


          .otherButton span {

            font-size:
              20px;
          }


          .scoreArea {

            grid-template-columns:
              1fr
              18px
              1fr
              62px;
          }

        }

      `}</style>

    </main>
  );
}
