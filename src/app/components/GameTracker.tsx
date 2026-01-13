"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------------- Types ---------------- */
type Counts = {
  made2: number;
  miss2: number;
  made3: number;
  miss3: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  to: number;
  stl: number;
  pf: number;
};

type GameEntry = {
  id: string;
  createdAt: number;
  date: string; // YYYY-MM-DD
  teamLogId: string;
  team: string;
  opponent: string;
  playerName: string;
  jerseyNumber?: string; // NEW (optional, safe with old saves)
  notes?: string;
  counts: Counts;
};

type TeamLog = {
  id: string;
  name: string;
  createdAt: number;
};

type Entitlements = {
    plan: "free" | "credits" | "annual";
    creditsRemaining: number;     // for single + packs
    freeSavesUsed: number;        // keeps your existing free trial logic
    updatedAt: number;
    singleCreditsUsed?: number;
  };  

type SeasonWindowKey = "Fall" | "Winter" | "Spring" | "Summer";

type UndoAction = {
  label: string;
  revert: () => void; // only store what we need for undo
  ts: number;
};

/** ---------------- Storage keys ---------------- */
const STORAGE_KEY_GAMES = "fly_stat_tracker_games_v3";
const STORAGE_KEY_ENT = "fly_entitlement_v1";
const STORAGE_KEY_TEAMLOGS = "fly_stat_tracker_team_logs_v1";
const STORAGE_KEY_PROGRESS = "fly_stat_tracker_progress_v1";

/** ---------------- Paywall rules ---------------- */
const TRIAL_FREE_GAMES = 2;

/** ---------------- Helpers ---------------- */
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function makeId() {
  return Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp0(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function formatPct(made: number, att: number) {
  if (att <= 0) return "0.0%";
  return `${((made / att) * 100).toFixed(1)}%`;
}

function formatAvg(total: number, games: number) {
  if (games <= 0) return "0.0";
  return (total / games).toFixed(1);
}

function formatDateUS(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function sumCounts(games: GameEntry[]): Counts {
  return games.reduce(
    (acc, g) => {
      const c = g.counts;
      acc.made2 += c.made2;
      acc.miss2 += c.miss2;
      acc.made3 += c.made3;
      acc.miss3 += c.miss3;
      acc.ftm += c.ftm;
      acc.fta += c.fta;
      acc.orb += c.orb;
      acc.drb += c.drb;
      acc.ast += c.ast;
      acc.to += c.to;
      acc.stl += c.stl;
      acc.pf += c.pf;
      return acc;
    },
    {
      made2: 0,
      miss2: 0,
      made3: 0,
      miss3: 0,
      ftm: 0,
      fta: 0,
      orb: 0,
      drb: 0,
      ast: 0,
      to: 0,
      stl: 0,
      pf: 0,
    }
  );
}

function getSeasonWindow(key: SeasonWindowKey, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan

  let start = "";
  let end = "";
  let label = "";

  if (key === "Fall") {
    start = `${y}-09-01`;
    end = `${y}-11-30`;
    label = `Fall ${y} (Sep 1–Nov 30)`;
  } else if (key === "Winter") {
    const winterStartYear = m <= 1 ? y - 1 : y;
    const winterEndYear = winterStartYear + 1;

    start = `${winterStartYear}-11-01`;
    end = `${winterEndYear}-02-28`;
    label = `Winter ${winterStartYear}-${winterEndYear} (Nov 1–Feb 28)`;
  } else if (key === "Spring") {
    start = `${y}-03-01`;
    end = `${y}-05-31`;
    label = `Spring ${y} (Mar 1–May 31)`;
  } else {
    start = `${y}-06-01`;
    end = `${y}-08-31`;
    label = `Summer ${y} (Jun 1–Aug 31)`;
  }

  return { key, label, start, end };
}

function getCurrentSeasonKey(now = new Date()): SeasonWindowKey {
  const m = now.getMonth();
  if (m === 10 || m === 11 || m === 0 || m === 1) return "Winter";
  if (m >= 2 && m <= 4) return "Spring";
  if (m >= 5 && m <= 7) return "Summer";
  return "Fall";
}

function getSeasonOrderStartingNow(now = new Date()): SeasonWindowKey[] {
  const order: SeasonWindowKey[] = ["Winter", "Spring", "Summer", "Fall"];
  const current = getCurrentSeasonKey(now);
  const idx = order.indexOf(current);
  return [...order.slice(idx), ...order.slice(0, idx)];
}
// ---------- ENTITLEMENT HELPERS (PASTE ABOVE GameTracker) ----------

type Plan = "single" | "pack_15" | "annual";

type Entitlement = {
  savesRemaining: number;        // for single + pack
  unlimitedUntil: number | null; // for annual
  redeemedSessions: string[];
};

const LS_KEY = "fly_entitlement_v1";

function loadEntitlement(): Entitlement {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
        const fresh: Entitlement = {
          savesRemaining: 2,          // ✅ 2 free trial saves
          unlimitedUntil: null,
          redeemedSessions: [],
        };
        localStorage.setItem(LS_KEY, JSON.stringify(fresh)); // ✅ persist it
        return fresh;
      }
      
    const parsed = JSON.parse(raw);
    return {
      savesRemaining: Number(parsed.savesRemaining || 0),
      unlimitedUntil: parsed.unlimitedUntil
        ? Number(parsed.unlimitedUntil)
        : null,
      redeemedSessions: Array.isArray(parsed.redeemedSessions)
        ? parsed.redeemedSessions
        : [],
    };
  } catch {
    return { savesRemaining: 0, unlimitedUntil: null, redeemedSessions: [] };
  }
}

function saveEntitlement(e: Entitlement) {
  localStorage.setItem(LS_KEY, JSON.stringify(e));
}

function hasUnlimited(e: Entitlement) {
  return !!(e.unlimitedUntil && Date.now() < e.unlimitedUntil);
}
function canLogGame(e: Entitlement | null) {
    if (!e) return false;
    if (hasUnlimited(e)) return true;
    return e.savesRemaining > 0;
  }
  
/** ---------------- Component ---------------- */
export default function GameTracker() {
    const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

    useEffect(() => {
      setEntitlement(loadEntitlement());
    }, []);
    const tapTimeoutRef = useRef<number | null>(null);
  const [keepAwake, setKeepAwake] = useState(true);
  const wakeLockRef = useRef<any>(null);

  // ----- Games / logs -----
  const [games, setGames] = useState<GameEntry[]>([]);
  const [teamLogs, setTeamLogs] = useState<TeamLog[]>([]);
  const [selectedTeamLogId, setSelectedTeamLogId] = useState<string>("");

  // Create Team Log
  const [newTeamLogName, setNewTeamLogName] = useState("");

  // ----- Entitlements (paywall) -----
  const [ent, setEnt] = useState<Entitlements>({
    plan: "free",
    creditsRemaining: 0,
    freeSavesUsed: 0,
    updatedAt: Date.now(),
  });  

  // ----- Form fields -----
  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [jerseyNumber, setJerseyNumber] = useState<string>(""); // NEW
  const [notes, setNotes] = useState<string>("");

  const [counts, setCounts] = useState<Counts>({
    made2: 0,
    miss2: 0,
    made3: 0,
    miss3: 0,
    ftm: 0,
    fta: 0,
    orb: 0,
    drb: 0,
    ast: 0,
    to: 0,
    stl: 0,
    pf: 0,
  });

  // ----- Undo -----
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const undoStackRef = useRef<UndoAction[]>([]);
  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  const pushUndo = (action: UndoAction) => {
    setUndoStack((prev) => [action, ...prev].slice(0, 80));
  };

  const doAction = (label: string, apply: () => void, revert: () => void) => {
    apply();
    pushUndo({ label, revert, ts: Date.now() });
  };

  const undoLastAction = () => {
    const stack = undoStackRef.current;
    const last = stack[0];
    if (!last) return;

    // run revert OUTSIDE the state updater (stable in Strict Mode)
    last.revert();

    setUndoStack((prev) => prev.slice(1));
  };

  // ----- Right side selections -----
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  // ----- Safety modals -----
  const [showSaveMenu, setShowSaveMenu] = useState(false);
const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showShareConfirm, setShowShareConfirm] = useState(false);

  // ----- Paywall + Season pick -----
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showSeasonPick, setShowSeasonPick] = useState(false);
  const [seasonPick, setSeasonPick] = useState<SeasonWindowKey | "">("");

  // ----- Undo tracking (for undo save) -----
  const [lastSavedEntry, setLastSavedEntry] = useState<GameEntry | null>(null);

  /** ---------------- Load from storage ---------------- */
  useEffect(() => {
    const loadedGames = safeParse<GameEntry[]>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_GAMES) : null,
      []
    );
    const progress = safeParse<ProgressSave>(
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_PROGRESS) : null,
        null as any
      );
      
      if (progress?.counts) {
        setDate(progress.date || todayISO());
        setTeam(progress.team || "Fly Academy");
        setOpponent(progress.opponent || "");
        setPlayerName(progress.playerName || "");
        setNotes(progress.notes || "");
        setCounts(progress.counts);
      }
      
    const rawEnt = safeParse<any>(
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_ENT) : null,
        null
      );
      
      // Migration: old -> new
      const loadedEnt: Entitlements = (() => {
        if (!rawEnt) {
            return {
              plan: "free",
              creditsRemaining: 0,
              freeSavesUsed: 0,
              updatedAt: Date.now(),
              singleCreditsUsed: 0, // <-- add this
            };
          }          
      
        // If already new shape
        if (typeof rawEnt?.creditsRemaining === "number" && typeof rawEnt?.freeSavesUsed === "number") {
            return {
                ...rawEnt,
                singleCreditsUsed: Number((rawEnt as any)?.singleCreditsUsed ?? 0),
              } as Entitlements;              
        }
      
        // Old shape fallback
        const oldUsed = Number(rawEnt?.singleCreditsUsed ?? 0);
        const oldPlan = rawEnt?.plan;
      
        // If they had "season" before, treat as annual (simplest)
        if (oldPlan === "season") {
            return {
              plan: "annual",
              creditsRemaining: 0,
              freeSavesUsed: oldUsed,
              updatedAt: Date.now(),
              singleCreditsUsed: oldUsed, // add this
            };
          }          
      
          return {
            plan: "free",
            creditsRemaining: 0,
            freeSavesUsed: oldUsed,
            updatedAt: Date.now(),
            singleCreditsUsed: oldUsed, // add this
          };          
      })();      

    const loadedLogs = safeParse<TeamLog[]>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_TEAMLOGS) : null,
      []
    );

    setGames(Array.isArray(loadedGames) ? loadedGames : []);
    setEnt(loadedEnt);

    let logs = Array.isArray(loadedLogs) ? loadedLogs : [];
    if (logs.length === 0) {
      const defaultLog: TeamLog = { id: makeId(), name: "Fly Academy", createdAt: Date.now() };
      logs = [defaultLog];
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY_TEAMLOGS, JSON.stringify(logs));
      }
    }
    setTeamLogs(logs);

    const defaultLogId = logs[0]?.id || "";
    setSelectedTeamLogId(defaultLogId);

    const players = Array.from(
      new Set((Array.isArray(loadedGames) ? loadedGames : []).filter((g) => g.teamLogId === defaultLogId).map((g) => g.playerName))
    ).sort();
    setSelectedPlayer(players[0] || "");
  }, []);

  /** ---------------- Persist ---------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify(games));
  }, [games]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_ENT, JSON.stringify(ent));
  }, [ent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY_TEAMLOGS, JSON.stringify(teamLogs));
  }, [teamLogs]);

  /** ---------------- Derived live values ---------------- */
  const pts = counts.made2 * 2 + counts.made3 * 3 + counts.ftm;

  const fgMade = counts.made2 + counts.made3;
  const fgAtt = fgMade + counts.miss2 + counts.miss3;

  const threeMade = counts.made3;
  const threeAtt = counts.made3 + counts.miss3;

  const ftMade = counts.ftm;
  const ftAtt = counts.fta;

  const ttlReb = counts.orb + counts.drb;

  const fgPct = formatPct(fgMade, fgAtt);
  const threePct = formatPct(threeMade, threeAtt);
  const ftPct = formatPct(ftMade, ftAtt);

  /** ---------------- Team Log + Player filters ---------------- */
  const gamesForTeamLog = useMemo(() => {
    if (!selectedTeamLogId) return [];
    return games.filter((g) => g.teamLogId === selectedTeamLogId);
  }, [games, selectedTeamLogId]);

  const playersForTeamLog = useMemo(() => {
    return Array.from(new Set(gamesForTeamLog.map((g) => g.playerName))).sort();
  }, [gamesForTeamLog]);

  useEffect(() => {
    if (!selectedTeamLogId) return;
    if (!selectedPlayer || !playersForTeamLog.includes(selectedPlayer)) {
      setSelectedPlayer(playersForTeamLog[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamLogId, playersForTeamLog.join("|")]);

  useEffect(() => {
    let cancelled = false;

    async function requestWakeLock() {
      try {
        // @ts-ignore
        if (!("wakeLock" in navigator)) return;
        // @ts-ignore
        wakeLockRef.current = await navigator.wakeLock.request("screen");

        if (cancelled) {
          await wakeLockRef.current?.release?.();
          wakeLockRef.current = null;
        }
      } catch {
        wakeLockRef.current = null;
      }
    }

    async function releaseWakeLock() {
      try {
        await wakeLockRef.current?.release?.();
      } catch {}
      wakeLockRef.current = null;
    }

    if (!keepAwake) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();

    function handleVisibility() {
      if (document.visibilityState === "visible" && keepAwake) requestWakeLock();
      else releaseWakeLock();
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, [keepAwake]);

  const gamesForSelection = useMemo(() => {
    if (!selectedPlayer) return [];
    return gamesForTeamLog.filter((g) => g.playerName === selectedPlayer);
  }, [gamesForTeamLog, selectedPlayer]);

  const seasonTotals = useMemo(() => sumCounts(gamesForSelection), [gamesForSelection]);
  const seasonGamesCount = gamesForSelection.length;

  /** ---------------- Season totals/averages for summary ---------------- */
  const seasonPtsTotal = seasonTotals.made2 * 2 + seasonTotals.made3 * 3 + seasonTotals.ftm;

  const seasonFgMade = seasonTotals.made2 + seasonTotals.made3;
  const seasonFgAtt = seasonFgMade + seasonTotals.miss2 + seasonTotals.miss3;

  const season3Made = seasonTotals.made3;
  const season3Att = seasonTotals.made3 + seasonTotals.miss3;

  const seasonFtMade = seasonTotals.ftm;
  const seasonFtAtt = seasonTotals.fta;

  const seasonRebTotal = seasonTotals.orb + seasonTotals.drb;
  const seasonAstTotal = seasonTotals.ast;
  const seasonStlTotal = seasonTotals.stl;
  const seasonToTotal = seasonTotals.to;
  const seasonSummaryPairs = useMemo(() => {
    const g = seasonGamesCount;

    return [
      { leftLabel: "PTS (Total)", leftValue: String(seasonPtsTotal), rightLabel: "PPG", rightValue: formatAvg(seasonPtsTotal, g) },
      { leftLabel: "FG (Total)", leftValue: `${seasonFgMade}-${seasonFgAtt}`, rightLabel: "FG%", rightValue: formatPct(seasonFgMade, seasonFgAtt) },
      { leftLabel: "3P (Total)", leftValue: `${season3Made}-${season3Att}`, rightLabel: "3P%", rightValue: formatPct(season3Made, season3Att) },
      { leftLabel: "FT (Total)", leftValue: `${seasonFtMade}-${seasonFtAtt}`, rightLabel: "FT%", rightValue: formatPct(seasonFtMade, seasonFtAtt) },
      { leftLabel: "REB (Total O+D)", leftValue: String(seasonRebTotal), rightLabel: "RPG (Total O+D)", rightValue: formatAvg(seasonRebTotal, g) },
      { leftLabel: "AST (Total)", leftValue: String(seasonAstTotal), rightLabel: "APG", rightValue: formatAvg(seasonAstTotal, g) },
      { leftLabel: "STL (Total)", leftValue: String(seasonStlTotal), rightLabel: "SPG", rightValue: formatAvg(seasonStlTotal, g) },
      { leftLabel: "TO (Total)", leftValue: String(seasonToTotal), rightLabel: "TO/G", rightValue: formatAvg(seasonToTotal, g) },
    ];
  }, [
    seasonGamesCount,
    seasonPtsTotal,
    seasonFgMade,
    seasonFgAtt,
    season3Made,
    season3Att,
    seasonFtMade,
    seasonFtAtt,
    seasonRebTotal,
    seasonAstTotal,
    seasonStlTotal,
    seasonToTotal,
  ]);

  /** ---------------- Paywall guard (global) ---------------- */
  const canFinishGame = () => {
    if (ent.plan === "annual") return true;
    if (ent.plan === "credits") return ent.creditsRemaining > 0;
    // free trial only applies when FINISHING (Game Over)
    return ent.freeSavesUsed < TRIAL_FREE_GAMES;
  };
  
  const spendFinishCredit = () => {
    if (ent.plan === "annual") return;
  
    if (ent.plan === "credits") {
      setEnt((prev) => ({
        ...prev,
        creditsRemaining: Math.max(0, prev.creditsRemaining - 1),
        updatedAt: Date.now(),
      }));
      return;
    }
  
    // free plan trial use
    setEnt((prev) => ({
      ...prev,
      freeSavesUsed: prev.freeSavesUsed + 1,
      updatedAt: Date.now(),
    }));
  };  

  const getLatestSavedEntryForSelection = () => {
    if (!selectedTeamLogId || !selectedPlayer) return null;

    const filtered = games.filter((g) => g.teamLogId === selectedTeamLogId && g.playerName === selectedPlayer);
    if (!filtered.length) return null;

    return [...filtered].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  };

  /** ---------------- Checkout ---------------- */
  type Plan = "single" | "pack_15" | "annual";

async function startCheckout(plan: Plan) {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }), // MUST be { plan }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Checkout failed");
    }

    if (!data?.url) {
      throw new Error("Missing checkout url");
    }

    window.location.href = data.url;
  } catch (err: any) {
    alert(err?.message || "Checkout error. Please try again.");
  }
}

  /** ---------------- Tap feedback ---------------- */
  const flashTap = () => {
    if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = window.setTimeout(() => {}, 80);
  };

  const inc = (key: keyof Counts, delta: number) => {
    flashTap();
    setCounts((c) => ({ ...c, [key]: clamp0((c[key] as number) + delta) } as Counts));
  };

  /** ---------------- Team Logs ---------------- */
  const addTeamLog = () => {
    const name = newTeamLogName.trim();
    if (!name) return;
    const newLog: TeamLog = { id: makeId(), name, createdAt: Date.now() };
    setTeamLogs((prev) => [newLog, ...prev]);
    setSelectedTeamLogId(newLog.id);
    setNewTeamLogName("");
  };

  /** ---------------- Save / Reset / Delete ---------------- */
  type ProgressSave = {
    savedAt: number;
    date: string;
    team: string;
    opponent: string;
    playerName: string;
    notes: string;
    counts: Counts;
    teamLogId: string;
  };
  
  const saveProgress = () => {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }
  
    const payload: ProgressSave = {
      savedAt: Date.now(),
      date: date || todayISO(),
      team: team.trim() || "Fly Academy",
      opponent: opponent.trim(),
      playerName: p,
      notes: notes.trim(),
      counts: { ...counts },
      teamLogId: selectedTeamLogId || teamLogs[0]?.id || "",
    };
  
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(payload));
    alert("Progress saved. You can continue tracking this game.");
  };
  
  const clearProgress = () => {
    localStorage.removeItem(STORAGE_KEY_PROGRESS);
  };
  const resetLive = () => {
    setCounts({
      made2: 0,
      miss2: 0,
      made3: 0,
      miss3: 0,
      ftm: 0,
      fta: 0,
      orb: 0,
      drb: 0,
      ast: 0,
      to: 0,
      stl: 0,
      pf: 0,
    });
    setOpponent("");
    setNotes("");
    // keep player/team/date as-is (you can change if desired)
    setUndoStack([]); // IMPORTANT: new game/live reset should clear undo
  };

  const saveGame = () => {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

    if (!canFinishGame()) {
        setShowUpgrade(true);
        return;
      }      

    const entry: GameEntry = {
      id: makeId(),
      createdAt: Date.now(),
      date: date || todayISO(),
      teamLogId: selectedTeamLogId || teamLogs[0]?.id || "",
      team: team.trim() || "Fly Academy",
      opponent: opponent.trim(),
      playerName: p,
      jerseyNumber: jerseyNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      counts: { ...counts },
    };

    setGames((g) => [entry, ...g]);
    setSelectedPlayer(p);
    setLastSavedEntry(entry);
    spendFinishCredit();
    clearProgress();
    
    if (ent.plan === "free") {
      setEnt((prev) => ({
        ...prev,
        singleCreditsUsed: (prev.singleCreditsUsed ?? 0) + 1,
        updatedAt: Date.now(),
      }));
    }

    resetLive();
  };

  const confirmSaveGame = () => {
    setShowShareConfirm(false);
    saveGame();
  };

  const shareMenu = () => setShowShareConfirm(true);

  const shareLatestGame = async () => {
    if (!selectedTeamLogId || !selectedPlayer) {
      alert("Select a Team and Player first.");
      return;
    }

    const latest = getLatestSavedEntryForSelection();
    if (!latest) {
      const goSave = confirm("Only saved games can be shared. Save now?");
      if (goSave) setShowShareConfirm(true);
      return;
    }

    const lines: string[] = [];
    lines.push("Fly Stat Tracker — Latest Game");
    lines.push(`Team: ${latest.team}`);
    lines.push(`Player: ${latest.playerName}${latest.jerseyNumber ? ` #${latest.jerseyNumber}` : ""}`);
    lines.push(`Date: ${formatDateUS(latest.date)}`);
    lines.push(`Opponent: ${latest.opponent || "-"}`);
    lines.push("");

    const c = latest.counts;
    lines.push(
      `PTS ${c.made2 * 2 + c.made3 * 3 + c.ftm} | FG ${c.made2 + c.made3}-${c.miss2 + c.miss3 + c.made2 + c.made3} | 3P ${c.made3}-${c.miss3 + c.made3} | FT ${c.ftm}-${c.fta}`
    );
    lines.push(`REB ${c.orb + c.drb} (O ${c.orb} / D ${c.drb}) | AST ${c.ast} | STL ${c.stl} | TO ${c.to}`);
    lines.push("");
    lines.push("Generated by Fly Stat Tracker");

    const text = lines.join("\n");

    try {
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({ title: "Fly Stat Tracker — Latest Game", text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard.");
      }
    } catch {}
  };

  const shareSeason = async () => {
    const latest = getLatestSavedEntryForSelection();
    if (!latest) {
      const goSave = confirm("Only saved games can be shared. Save now?");
      if (goSave) setShowShareConfirm(true);
      return;
    }

    if (!selectedTeamLogId || !selectedPlayer) {
      alert("Select a Team and Player first.");
      return;
    }

    const seasonKey = seasonPick || getCurrentSeasonKey();
    const window = getSeasonWindow(seasonKey);

    const startMs = new Date(window.start + "T00:00:00").getTime();
    const endMs = new Date(window.end + "T23:59:59").getTime();

    const seasonGames = games.filter((g) => {
      if (g.teamLogId !== selectedTeamLogId) return false;
      if (g.playerName !== selectedPlayer) return false;

      const t = typeof g.createdAt === "number" ? g.createdAt : new Date(g.date + "T12:00:00").getTime();
      return t >= startMs && t <= endMs;
    });

    if (!seasonGames.length) {
      alert("No saved games found for this player/team in that season window.");
      return;
    }

    const totals = sumCounts(seasonGames);

    const ptsT = totals.made2 * 2 + totals.made3 * 3 + totals.ftm;
    const fgm = totals.made2 + totals.made3;
    const fga = totals.made2 + totals.made3 + totals.miss2 + totals.miss3;
    const fgP = fga ? (fgm / fga) * 100 : 0;

    const tpm = totals.made3;
    const tpa = totals.made3 + totals.miss3;
    const tpP = tpa ? (tpm / tpa) * 100 : 0;

    const ftmT = totals.ftm;
    const ftaT = totals.fta;
    const ftP = ftaT ? (ftmT / ftaT) * 100 : 0;

    const reb = totals.orb + totals.drb;
    const n = seasonGames.length;

    const lines: string[] = [];
    lines.push("Fly Stat Tracker — Season Summary");
    lines.push(`Team: ${latest.team}`);
    lines.push(`Player: ${selectedPlayer}`);
    lines.push(`Season: ${window.label}`);
    lines.push(`Games: ${n}`);
    lines.push("");

    lines.push(`PTS: ${ptsT} | PPG: ${(ptsT / n).toFixed(1)}`);
    lines.push(`FG: ${fgm}-${fga} | FG%: ${fgP.toFixed(1)}%`);
    lines.push(`3P: ${tpm}-${tpa} | 3P%: ${tpP.toFixed(1)}%`);
    lines.push(`FT: ${ftmT}-${ftaT} | FT%: ${ftP.toFixed(1)}%`);
    lines.push(`REB: ${reb} (O ${totals.orb} / D ${totals.drb}) | RPG: ${(reb / n).toFixed(1)}`);
    lines.push(`AST: ${totals.ast} | APG: ${(totals.ast / n).toFixed(1)}`);
    lines.push(`STL: ${totals.stl} | SPG: ${(totals.stl / n).toFixed(1)}`);
    lines.push(`TO: ${totals.to} | TO/G: ${(totals.to / n).toFixed(1)}`);
    lines.push("");
    lines.push("Generated by Fly Stat Tracker");

    const text = lines.join("\n");

    try {
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({ title: "Fly Stat Tracker — Season Summary", text });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard.");
      }
    } catch {}
  };

  const requestDeleteGame = (id: string) => setPendingDeleteId(id);

  const confirmDeleteGame = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setGames((g) => g.filter((x) => x.id !== id));
    setPendingDeleteId(null);
    setLastSavedEntry((prev) => (prev?.id === id ? null : prev));
  };

  /** ---------------- Small UI helper ---------------- */
  function PillValue({ value }: { value: string | number }) {
    const text = typeof value === "number" ? String(value) : value;
    const tight = text.length >= 6;

    return (
      <div className="pillValue">
        <span className={`chipValueText ${tight ? "chipValueText--tight" : "chipValueText--fit"}`}>{text}</span>
      </div>
    );
  }

  function HustleButton({
    label,
    sub,
    value,
    onClick,
  }: {
    label: string;
    sub: string;
    value: number;
    onClick: () => void;
  }) {
    return (
      <button className="tileBtn tileHustle" type="button" onClick={onClick} style={{ position: "relative" }}>
        <div className="tileTop" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
          <span>{label}</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            {value}
          </span>
        </div>
        <div className="tileSub">{sub}</div>
      </button>
    );
  }

  /** ---------------- UI ---------------- */
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">PREPARE FOR TAKEOFF</div>
          <h1 className="title">FLY STAT TRACKER</h1>
          <div className="subtitle">Track your Player&apos;s stats for a game or for a season.</div>
        </div>

        <div className="topActions">
          <button className="ghostBtn" type="button" onClick={() => setShowUndoConfirm(true)} disabled={undoStack.length === 0}>
            Undo
          </button>

          <button className="ghostBtn" type="button" onClick={shareMenu}>
            Share
          </button>

          <button className="ghostBtn" type="button" onClick={() => setShowResetConfirm(true)}>
            Reset
          </button>
        </div>
      </div>

      <div className="mainGrid">
        {/* LEFT: Live Game Tracker */}
<div className="card">
  {/* Header */}
  <div className="cardHeader mockHeader">
    <div className="cardTitle">Live Game Tracker</div>

    <div className="mockHeaderRight">
      <button className="mockSaveBtn" type="button" onClick={() => setShowSaveMenu(true)}>
        Save Game
      </button>
    </div>
  </div>

  {/* Form (mock order) */}
  <div className="mockForm">
    {/* DATE (full width) */}
    <div className="field">
      <div className="label">DATE</div>
      <input className="input mockInputCenter" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
    </div>

    {/* PLAYER NAME + NUMBER */}
    <div className="mockTwoCol">
      <div className="field">
        <div className="label">
          PLAYER NAME <span className="req">*</span>
        </div>
        <input className="input" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="ex: Jordan Smith" />
      </div>

      <div className="field">
        <div className="label">NUMBER</div>
        <input className="input" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)} placeholder="#" inputMode="numeric" />
      </div>
    </div>

    {/* TEAM */}
    <div className="field">
      <div className="label">TEAM</div>
      <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Fly Academy" />
    </div>

    {/* OPPONENT */}
    <div className="field">
      <div className="label">OPPONENT</div>
      <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="ex: Team Alpha 14U" />
    </div>

    {/* small date echo (like mock) */}
    <div className="mockDateEcho">{formatDateUS(date)}</div>
  </div>

  {/* SCORING */}
  <div className="mockSectionHeader">
  <div className="mockSectionLabel">SCORING</div>

  <button
    className="mockUndoBtn"
    type="button"
    onClick={() => setShowUndoConfirm(true)}
    disabled={undoStack.length === 0}
  >
    Undo
  </button>
</div>

  {/* Row 1 Outputs: PTS wide + FG + FG% */}
  <div className="mockScoringTop">
    <div className="mockPill mockPillDark mockPillPts">
      <div className="mockPillLabel">PTS</div>
      <div className="mockPillValue">{pts}</div>
    </div>

    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">Total FG’s</div>
      <div className="mockPillValue">{`${fgMade}-${fgAtt}`}</div>
    </div>

    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">Total FG%</div>
      <div className="mockPillValue">{fgPct}</div>
    </div>
  </div>

  {/* Row 2 Inputs (green) */}
  <div className="mockBtnRow3">
    <button
      className="mockActionBtn mockActionBtnGreen"
      type="button"
      onClick={() => doAction("Made 2PT", () => inc("made2", 1), () => inc("made2", -1))}
    >
      <div className="mockBtnTop">Made 2PT</div>
      <div className="mockBtnBig">+2</div>
    </button>

    <button
      className="mockActionBtn mockActionBtnGreen"
      type="button"
      onClick={() => doAction("Made 3PT", () => inc("made3", 1), () => inc("made3", -1))}
    >
      <div className="mockBtnTop">Made 3PT</div>
      <div className="mockBtnBig">+3</div>
    </button>

    <button
      className="mockActionBtn mockActionBtnGreen"
      type="button"
      onClick={() =>
        doAction(
          "Made FT",
          () => {
            inc("ftm", 1);
            inc("fta", 1);
          },
          () => {
            inc("ftm", -1);
            inc("fta", -1);
          }
        )
      }
    >
      <div className="mockBtnTop">Made FT</div>
      <div className="mockBtnBig">+1</div>
    </button>
  </div>

  {/* Row 3 Inputs (red) */}
  <div className="mockBtnRow3">
    <button className="mockActionBtn mockActionBtnRed" type="button" onClick={() => doAction("Miss 2PT", () => inc("miss2", 1), () => inc("miss2", -1))}>
      <div className="mockBtnTop">Missed 2PT</div>
      <div className="mockBtnBig">2 Miss</div>
    </button>

    <button className="mockActionBtn mockActionBtnRed" type="button" onClick={() => doAction("Miss 3PT", () => inc("miss3", 1), () => inc("miss3", -1))}>
      <div className="mockBtnTop">Missed 3P</div>
      <div className="mockBtnBig">3 Miss</div>
    </button>

    <button className="mockActionBtn mockActionBtnRed" type="button" onClick={() => doAction("Missed FT", () => inc("fta", 1), () => inc("fta", -1))}>
      <div className="mockBtnTop">Missed FT</div>
      <div className="mockBtnBig">FT Miss</div>
    </button>
  </div>

  {/* Row 4 Outputs (4 small pills) */}
  <div className="mockScoringBottom">
    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">3P FG’s</div>
      <div className="mockPillValue">{`${threeMade}-${threeAtt}`}</div>
    </div>

    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">3P FG%</div>
      <div className="mockPillValue">{threePct}</div>
    </div>

    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">FT’s</div>
      <div className="mockPillValue">{`${ftMade}-${ftAtt}`}</div>
    </div>

    <div className="mockPill mockPillLight">
      <div className="mockPillLabel">FT%</div>
      <div className="mockPillValue">{ftPct}</div>
    </div>
  </div>

  {/* HUSTLE + OTHER */}
  <div className="mockSectionLabel">HUSTLE + OTHER</div>

  <div className="mockHustleGrid">
    <button className="mockHustleBtn" type="button" onClick={() => doAction("DRB", () => inc("drb", 1), () => inc("drb", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ D.REB</div>
        <div className="mockHustleSub">Def. Rebound</div>
      </div>
      <div className="mockHustleVal">{counts.drb}</div>
    </button>

    <button className="mockHustleBtn" type="button" onClick={() => doAction("ORB", () => inc("orb", 1), () => inc("orb", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ O.REB</div>
        <div className="mockHustleSub">Off. Rebound</div>
      </div>
      <div className="mockHustleVal">{counts.orb}</div>
    </button>

    <button className="mockHustleBtn" type="button" onClick={() => doAction("AST", () => inc("ast", 1), () => inc("ast", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ AST</div>
        <div className="mockHustleSub">Assist</div>
      </div>
      <div className="mockHustleVal">{counts.ast}</div>
    </button>

    <button className="mockHustleBtn" type="button" onClick={() => doAction("STL", () => inc("stl", 1), () => inc("stl", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ STL</div>
        <div className="mockHustleSub">Steal</div>
      </div>
      <div className="mockHustleVal">{counts.stl}</div>
    </button>

    <button className="mockHustleBtn" type="button" onClick={() => doAction("TO", () => inc("to", 1), () => inc("to", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ TO</div>
        <div className="mockHustleSub">Turnover</div>
      </div>
      <div className="mockHustleVal">{counts.to}</div>
    </button>

    <button className="mockHustleBtn" type="button" onClick={() => doAction("FOUL", () => inc("pf", 1), () => inc("pf", -1))}>
      <div className="mockHustleLeft">
        <div className="mockHustleTop">+ FOUL</div>
        <div className="mockHustleSub">Player Foul</div>
      </div>
      <div className="mockHustleVal">{counts.pf}</div>
    </button>
  </div>

  {/* NOTES */}
  <div className="field" style={{ marginTop: 14 }}>
    <div className="label">NOTES</div>
    <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
  </div>

  <div className="mockBottomSave">
  <button className="mockSaveBtn" type="button" onClick={() => setShowSaveMenu(true)}>
    Save Game
  </button>
</div>

  {/* Mobile sticky Save (matches mock bottom button) */}

  <div className="microHint">Tip: Use Save to lock in games for season stats.</div>
</div>

        {/* RIGHT: Player Log */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Player Log</div>
              <div className="cardHint">{seasonGamesCount} games</div>
            </div>
          </div>

          {/* Team Logs */}
          <div className="formGrid" style={{ marginBottom: 10 }}>
            <div className="field">
              <div className="label">TEAM LOG</div>
              <select className="select" value={selectedTeamLogId} onChange={(e) => setSelectedTeamLogId(e.target.value)}>
                {teamLogs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <div className="label">CREATE TEAM LOG</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" value={newTeamLogName} onChange={(e) => setNewTeamLogName(e.target.value)} placeholder="ex: School Team" />
                <button className="ghostBtn" type="button" onClick={addTeamLog}>
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="field">
            <div className="label">SELECT PLAYER</div>
            <select className="select" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}>
              <option value="">{playersForTeamLog.length ? "Select a player" : "No players yet"}</option>
              {playersForTeamLog.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="sectionLabel">Season-to-date</div>

          <div className="statsGrid">
            {seasonSummaryPairs.flatMap((row, idx) => [
              <div className="statBox" key={`${idx}-L`}>
                <div className="statLabel">{row.leftLabel}</div>
                <div className="statValue">{row.leftValue}</div>
              </div>,
              <div className="statBox" key={`${idx}-R`}>
                <div className="statLabel">{row.rightLabel}</div>
                <div className="statValue">{row.rightValue}</div>
              </div>,
            ])}
          </div>

          <div className="microHint">Tip: Stats + games list filter by selected Team Log + selected player.</div>

          <div className="sectionLabel">Games</div>

          {gamesForSelection.length === 0 ? (
            <div className="microHint">No games saved for this player yet.</div>
          ) : (
            <div className="gamesList">
              {gamesForSelection.map((g) => {
                const c = g.counts;
                const gPts = c.made2 * 2 + c.made3 * 3 + c.ftm;
                const gFgM = c.made2 + c.made3;
                const gFgA = gFgM + c.miss2 + c.miss3;
                const g3A = c.made3 + c.miss3;
                const gReb = c.orb + c.drb;

                return (
                  <div className="gameCard" key={g.id}>
                    <div className="gameTop">
                      <div>
                        <div className="gameTitle">
                          {g.playerName}
                          {g.jerseyNumber ? ` #${g.jerseyNumber}` : ""} • {g.date}
                        </div>
                        <div className="gameMeta">
                          PTS {gPts} • FG {gFgM}-{gFgA} • 3P {c.made3}-{g3A} • FT {c.ftm}-{c.fta}
                        </div>
                      </div>

                      <button className="dangerBtn" type="button" onClick={() => requestDeleteGame(g.id)}>
                        Delete
                      </button>
                    </div>

                    <div className="gameMiniRow">
                      <div className="gameMini">
                        <div className="gameMiniLabel">REB</div>
                        <div className="gameMiniValue">{gReb}</div>
                      </div>
                      <div className="gameMini">
                        <div className="gameMiniLabel">AST</div>
                        <div className="gameMiniValue">{c.ast}</div>
                      </div>
                      <div className="gameMini">
                        <div className="gameMiniLabel">STL</div>
                        <div className="gameMiniValue">{c.stl}</div>
                      </div>
                      <div className="gameMini">
                        <div className="gameMiniLabel">FOUL</div>
                        <div className="gameMiniValue">{c.pf}</div>
                      </div>
                    </div>

                    {g.notes ? <div className="microHint">{g.notes}</div> : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="microHint">Saved games are stored locally on this device.</div>
        </div>
      </div>

      {/* ---------------- Modals ---------------- */}

      {/* Save Confirm */}
      {showSaveMenu ? (
  <div className="modalOverlay" role="dialog" aria-modal="true">
    <div className="modal">
      <h2>Save Game</h2>
      <p>Choose how you want to save.</p>

      <button
        className="primaryBtn"
        type="button"
        onClick={() => {
          setShowSaveMenu(false);
          saveProgress();
        }}
      >
        Save Progress
      </button>

      <button
        className="ghostBtn"
        type="button"
        onClick={() => {
          setShowSaveMenu(false);
          setShowFinishConfirm(true);
        }}
      >
        Game Over — Log Stats
      </button>

      <button className="ghostBtn" type="button" onClick={() => setShowSaveMenu(false)}>
        Cancel
      </button>

      <div className="microHint">
        Tip: Save Progress doesn’t use credits. Game Over logs final stats and resets the Live Game Tracker.
      </div>
    </div>
  </div>
) : null}

{showFinishConfirm ? (
  <div className="modalOverlay" role="dialog" aria-modal="true">
    <div className="modal">
      <h2>Finish Game &amp; Log Stats?</h2>
      <p>
        This will use <b>1 game credit</b>, add the final stats to the Player Log, and reset the Live Game Tracker.
      </p>

      <div className="microHint">
        You can save progress as often as you like. Credits are only used when you finish a game.
      </div>

      <button
        className="primaryBtn"
        type="button"
        onClick={() => {
          setShowFinishConfirm(false);
          saveGame();
        }}
      >
        Yes — Finish &amp; Log Game
      </button>

      <button
        className="ghostBtn"
        type="button"
        onClick={() => {
          setShowFinishConfirm(false);
          setShowSaveMenu(true);
        }}
      >
        Go Back
      </button>
    </div>
  </div>
) : null}

      {/* Delete Confirm */}
      {pendingDeleteId ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Delete game?</h2>
            <p>This will permanently remove this saved game from this device.</p>

            <button className="primaryBtn" type="button" onClick={confirmDeleteGame}>
              Delete
            </button>
            <button className="ghostBtn" type="button" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Share Confirm */}
      {showShareConfirm ? (
        <div className="modalOverlay" onClick={() => setShowShareConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">What would you like to share?</div>

            <div className="modalActions" style={{ display: "grid", gap: 10 }}>
              <button
                className="primaryBtn"
                type="button"
                onClick={() => {
                  setShowShareConfirm(false);
                  shareLatestGame();
                }}
              >
                Share Latest Game
              </button>

              <button
                className="primaryBtn"
                type="button"
                onClick={() => {
                  setShowShareConfirm(false);
                  shareSeason();
                }}
              >
                Share Season Summary
              </button>

              <button className="ghostBtn" type="button" onClick={() => setShowShareConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reset Confirm */}
      {showResetConfirm ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Reset live tracker?</h2>
            <p>This will reset the live counts back to 0. Continue?</p>

            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                setShowResetConfirm(false);
                resetLive();
              }}
            >
              Reset
            </button>
            <button className="ghostBtn" type="button" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Undo Confirm */}
      {showUndoConfirm ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Undo last action?</h2>
            <p>This will undo the most recent stat button you tapped.</p>

            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                setShowUndoConfirm(false);
                undoLastAction();
              }}
              disabled={undoStack.length === 0}
            >
              Undo
            </button>

            <button className="ghostBtn" type="button" onClick={() => setShowUndoConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Upgrade / Paywall modal */}
      {showUpgrade ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Unlock Saving (modal v2)</h2>
            <p>
              You&apos;ve used your {TRIAL_FREE_GAMES} free game saves. Upgrade to continue saving games and viewing season stats.
            </p>

            <button className="primaryBtn" type="button" onClick={() => startCheckout("single")}>
              Add This Game ($2)
            </button>
            
            <button
  className="primaryBtn"
  type="button"
  onClick={() => startCheckout("pack_15")}
>
  15-Game Pack ($15)
</button>

            <button
  className="primaryBtn"
  type="button"
  onClick={() => startCheckout("annual")}
>
  1-Year Unlimited ($23)
</button>

            <button className="ghostBtn" type="button" onClick={() => setShowUpgrade(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {/* Season pick (required) */}
      {showSeasonPick ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Select Season Window</h2>
            <p>Choose Fall/Winter/Spring/Summer. This will be attached to your Season Pass purchase.</p>

            <div className="field" style={{ marginTop: 8 }}>
              <div className="label">SEASON</div>
              <select className="select" value={seasonPick} onChange={(e) => setSeasonPick(e.target.value as any)}>
                <option value="">Select…</option>
                {getSeasonOrderStartingNow().map((k) => (
                  <option key={k} value={k}>
                    {getSeasonWindow(k).label}
                  </option>
                ))}
              </select>
            </div>

            {seasonPick ? (
              <div className="microHint">
                Access window: {getSeasonWindow(seasonPick).start} → {getSeasonWindow(seasonPick).end}
              </div>
            ) : null}

            <button
              className="primaryBtn"
              type="button"
              disabled={!seasonPick}
            >
              Continue to Checkout
            </button>

            <button
              className="ghostBtn"
              type="button"
              onClick={() => {
                setShowSeasonPick(false);
                setSeasonPick("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
