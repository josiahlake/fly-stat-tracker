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
  teamLogId: string; // NEW
  team: string;
  opponent: string;
  playerName: string;
  notes?: string;
  counts: Counts;
};

type TeamLog = {
  id: string;
  name: string;
  createdAt: number;
};

type Entitlements = {
  plan: "free" | "season" | "single_game";
  singleCreditsUsed: number; // for free saves tracking
  updatedAt: number;
};

type SeasonWindowKey = "Fall" | "Winter" | "Spring" | "Summer";

/** ---------------- Storage keys ---------------- */
const STORAGE_KEY_GAMES = "fly_stat_tracker_games_v3";
const STORAGE_KEY_ENT = "fly_stat_tracker_entitlements_v1";
const STORAGE_KEY_TEAMLOGS = "fly_stat_tracker_team_logs_v1";

/** ---------------- Paywall rules ---------------- */
const TRIAL_FREE_GAMES = 2; // global per device/user (per your request)

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
    // iso expected: "YYYY-MM-DD"
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
    } 
    else if (key === "Winter") {
      // If Jan/Feb, winter started LAST year
      const winterStartYear = m <= 1 ? y - 1 : y;
      const winterEndYear = winterStartYear + 1;
  
      start = `${winterStartYear}-11-01`;
      end = `${winterEndYear}-02-28`;
      label = `Winter ${winterStartYear}-${winterEndYear} (Nov 1–Feb 28)`;
    } 
    else if (key === "Spring") {
      start = `${y}-03-01`;
      end = `${y}-05-31`;
      label = `Spring ${y} (Mar 1–May 31)`;
    } 
    else {
      // Summer
      start = `${y}-06-01`;
      end = `${y}-08-31`;
      label = `Summer ${y} (Jun 1–Aug 31)`;
    }
  
    return { key, label, start, end };
  }
  function getCurrentSeasonKey(now = new Date()): SeasonWindowKey {
    const m = now.getMonth(); // 0=Jan ... 11=Dec
  
    // Winter = Nov 1 – Feb 28
    if (m === 10 || m === 11 || m === 0 || m === 1) return "Winter";
    // Spring = Mar 1 – May 31
    if (m >= 2 && m <= 4) return "Spring";
    // Summer = Jun 1 – Aug 31
    if (m >= 5 && m <= 7) return "Summer";
    // Fall = Sep 1 – Nov 30 (Sep/Oct here; Nov handled above as Winter)
    return "Fall";
  }
  
  function getSeasonOrderStartingNow(now = new Date()): SeasonWindowKey[] {
    const order: SeasonWindowKey[] = ["Winter", "Spring", "Summer", "Fall"];
    const current = getCurrentSeasonKey(now);
    const idx = order.indexOf(current);
    return [...order.slice(idx), ...order.slice(0, idx)];
  }    

/** ---------------- Component ---------------- */
export default function GameTracker() {
  const tapTimeoutRef = useRef<number | null>(null);

  // ----- Games / logs -----
  const [games, setGames] = useState<GameEntry[]>([]);
  const [teamLogs, setTeamLogs] = useState<TeamLog[]>([]);
  const [selectedTeamLogId, setSelectedTeamLogId] = useState<string>("");

  // Create Team Log
  const [newTeamLogName, setNewTeamLogName] = useState("");

  // ----- Entitlements (paywall) -----
  const [ent, setEnt] = useState<Entitlements>({
    plan: "free",
    singleCreditsUsed: 0,
    updatedAt: Date.now(),
  });

  // ----- Form fields -----
  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
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

  // ----- Right side selections -----
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  // ----- Safety modals -----
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showShareConfirm, setShowShareConfirm] = useState(false);
  const [pendingShareAfterSave, setPendingShareAfterSave] = useState<null | "latest">(null);
  
  // ----- Paywall + Season pick -----
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showSeasonPick, setShowSeasonPick] = useState(false);
  const [seasonPick, setSeasonPick] = useState<SeasonWindowKey | "">("");

  // ----- Undo tracking -----
  const [lastSavedEntry, setLastSavedEntry] = useState<GameEntry | null>(null);

  /** ---------------- Load from storage ---------------- */
  useEffect(() => {
    const loadedGames = safeParse<GameEntry[]>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_GAMES) : null,
      []
    );

    const loadedEnt = safeParse<Entitlements>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_ENT) : null,
      { plan: "free", singleCreditsUsed: 0, updatedAt: Date.now() }
    );

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

  /** ---------------- Exact Season Summary reorder (8 rows x 2 cols) ---------------- */
  const seasonSummaryPairs = useMemo(() => {
    const g = seasonGamesCount;

    return [
      // PTS (Total) | PPG
      { leftLabel: "PTS (Total)", leftValue: String(seasonPtsTotal), rightLabel: "PPG", rightValue: formatAvg(seasonPtsTotal, g) },

      // FG (Total) | FG%
      {
        leftLabel: "FG (Total)",
        leftValue: `${seasonFgMade}-${seasonFgAtt}`,
        rightLabel: "FG%",
        rightValue: formatPct(seasonFgMade, seasonFgAtt),
      },

      // 3P (Total) | 3P%
      {
        leftLabel: "3P (Total)",
        leftValue: `${season3Made}-${season3Att}`,
        rightLabel: "3P%",
        rightValue: formatPct(season3Made, season3Att),
      },

      // FT (Total) | FT%
      {
        leftLabel: "FT (Total)",
        leftValue: `${seasonFtMade}-${seasonFtAtt}`,
        rightLabel: "FT%",
        rightValue: formatPct(seasonFtMade, seasonFtAtt),
      },

      // REB (Total O+D) | RPG (Total O+D)
      {
        leftLabel: "REB (Total O+D)",
        leftValue: String(seasonRebTotal),
        rightLabel: "RPG (Total O+D)",
        rightValue: formatAvg(seasonRebTotal, g),
      },

      // AST (Total) | APG
      {
        leftLabel: "AST (Total)",
        leftValue: String(seasonAstTotal),
        rightLabel: "APG",
        rightValue: formatAvg(seasonAstTotal, g),
      },

      // STL (Total) | SPG
      {
        leftLabel: "STL (Total)",
        leftValue: String(seasonStlTotal),
        rightLabel: "SPG",
        rightValue: formatAvg(seasonStlTotal, g),
      },

      // TO (Total) | TO/G
      {
        leftLabel: "TO (Total)",
        leftValue: String(seasonToTotal),
        rightLabel: "TO/G",
        rightValue: formatAvg(seasonToTotal, g),
      },
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
  const canSaveAnotherGame = () => {
    if (ent.plan !== "free") return true;
    return ent.singleCreditsUsed < TRIAL_FREE_GAMES;
  };
  const getLatestSavedEntryForSelection = () => {
    if (!selectedTeamLogId || !selectedPlayer) return null;
  
    const filtered = games.filter(
      (g) => g.teamLogId === selectedTeamLogId && g.playerName === selectedPlayer
    );
  
    if (!filtered.length) return null;
  
    // Prefer createdAt if present; fallback to date string
    return [...filtered].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  };
  
  /** ---------------- Checkout ---------------- */
  function startCheckout(plan: "single_game" | "season", meta?: Record<string, any>) {
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, meta }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
  
        if (!r.ok) {
          // show the real backend error (MUCH easier to debug)
          const msg = data?.error || "Checkout failed";
          throw new Error(msg);
        }
  
        return data;
      })
      .then((data) => {
        if (data?.url) window.location.href = data.url;
        else throw new Error("Checkout URL missing from server response");
      })
      .catch((err) => {
        alert(err?.message || "Checkout error for ${plan}. Please try again.");
      });
  }  

  /** ---------------- Tap feedback ---------------- */
  const flashTap = () => {
    if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = window.setTimeout(() => {
      // no-op; you already have .tapped styling for buttons
    }, 80);
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

  /** ---------------- Save / Reset / Undo / Delete ---------------- */
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
  };

  const saveGame = () => {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

    if (!canSaveAnotherGame()) {
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
      notes: notes.trim() || undefined,
      counts: { ...counts },
    };

    setGames((g) => [entry, ...g]);
    setSelectedPlayer(p);
    setLastSavedEntry(entry);

    // Global free-saves tracking per device/user
    if (ent.plan === "free") {
      setEnt((prev) => ({
        ...prev,
        singleCreditsUsed: prev.singleCreditsUsed + 1,
        updatedAt: Date.now(),
      }));
    }

    resetLive();
  };

  const confirmSaveGame = () => {
    setShowSaveConfirm(false);
    saveGame();
  };

  const undoLastSave = () => {
    if (!lastSavedEntry) return;
    const id = lastSavedEntry.id;
    setGames((g) => g.filter((x) => x.id !== id));
    setLastSavedEntry(null);
  };
  const shareMenu = () => {
    setShowShareConfirm(true);
  };  
  
  const shareLatestGame = async () => {
    // Safety: must have team + player selected
    if (!selectedTeamLogId || !selectedPlayer) {
      alert("Select a Team and Player first.");
      return;
    }
  
    const latest = getLatestSavedEntryForSelection();
  
    // Safety: must be saved
    if (!latest) {
        const goSave = confirm("Only saved games can be shared. Save now?");
        if (goSave) setShowSaveConfirm(true); // opens your existing Save modal
        return;
      }      
  
    const lines: string[] = [];
    lines.push("Fly Stat Tracker — Latest Game");
    lines.push(`Team: ${latest.team}`);
    lines.push(`Player: ${latest.playerName}`);
    lines.push(`Date: ${formatDateUS(latest.date)}`);
    lines.push(`Opponent: ${latest.opponent || "-"}`);
    lines.push("");
  
    const c = latest.counts;
    lines.push(
      `PTS ${c.made2 * 2 + c.made3 * 3 + c.ftm} | FG ${c.made2 + c.made3}-${c.miss2 + c.miss3 + c.made2 + c.made3} | 3P ${c.made3}-${c.miss3 + c.made3} | FT ${c.ftm}-${c.fta}`
    );
    lines.push(
      `REB ${c.orb + c.drb} (O ${c.orb} / D ${c.drb}) | AST ${c.ast} | STL ${c.stl} | TO ${c.to}`
    );
    lines.push("");
    lines.push("Generated by Fly Stat Tracker");
  
    const text = lines.join("\n");
  
    try {
      // Mobile-first
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({
          title: "Fly Stat Tracker — Latest Game",
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied to clipboard.");
      }
    } catch {
      // user cancelled share sheet — do nothing
    }
  };  
  
  const shareSeason = async () => {
    // SAFETY: season sharing requires saved games too
    const latest = getLatestSavedEntryForSelection();
    if (!latest) {
        const goSave = confirm("Only saved games can be shared. Save now?");
        if (goSave) setShowSaveConfirm(true); // opens existing Save modal
        return;
      }      
  
    // Gather all games for current selection (team + player)
    if (!selectedTeamLogId || !selectedPlayer) {
      alert("Select a Team and Player first.");
      return;
    }
  
    const seasonKey = seasonPick || getCurrentSeasonKey(); // if seasonPick required, this still works
    const window = getSeasonWindow(seasonKey);
  
    // Filter games for this team/player AND inside the chosen season window
    const startMs = new Date(window.start + "T00:00:00").getTime();
    const endMs = new Date(window.end + "T23:59:59").getTime();
  
    const seasonGames = games.filter((g) => {
      if (g.teamLogId !== selectedTeamLogId) return false;
      if (g.playerName !== selectedPlayer) return false;
  
      // Prefer createdAt; fallback to date string
      const t = typeof g.createdAt === "number"
        ? g.createdAt
        : new Date(g.date + "T12:00:00").getTime();
  
      return t >= startMs && t <= endMs;
    });
  
    if (!seasonGames.length) {
      alert("No saved games found for this player/team in that season window.");
      return;
    }
  
    // Sum counts
    const totals = sumCounts(seasonGames);
  
    const pts = totals.made2 * 2 + totals.made3 * 3 + totals.ftm;
    const fgm = totals.made2 + totals.made3;
    const fga = totals.made2 + totals.made3 + totals.miss2 + totals.miss3;
    const fgPct = fga ? (fgm / fga) * 100 : 0;
  
    const tpm = totals.made3;
    const tpa = totals.made3 + totals.miss3;
    const tpPct = tpa ? (tpm / tpa) * 100 : 0;
  
    const ftm = totals.ftm;
    const fta = totals.fta;
    const ftPct = fta ? (ftm / fta) * 100 : 0;
  
    const reb = totals.orb + totals.drb;
    const n = seasonGames.length;
  
    const lines: string[] = [];
    lines.push("Fly Stat Tracker — Season Summary");
    lines.push(`Team: ${latest.team}`);
    lines.push(`Player: ${selectedPlayer}`);
    lines.push(`Season: ${window.label}`);
    lines.push(`Games: ${n}`);
    lines.push("");
  
    lines.push(`PTS: ${pts} | PPG: ${(pts / n).toFixed(1)}`);
    lines.push(`FG: ${fgm}-${fga} | FG%: ${fgPct.toFixed(1)}%`);
    lines.push(`3P: ${tpm}-${tpa} | 3P%: ${tpPct.toFixed(1)}%`);
    lines.push(`FT: ${ftm}-${fta} | FT%: ${ftPct.toFixed(1)}%`);
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
    } catch {
      // user cancelled share sheet; do nothing
    }
  };  
  
  const requestDeleteGame = (id: string) => setPendingDeleteId(id);

  const confirmDeleteGame = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setGames((g) => g.filter((x) => x.id !== id));
    setPendingDeleteId(null);
    setLastSavedEntry((prev) => (prev?.id === id ? null : prev));
  };

  /** ---------------- Pill rendering (overflow-safe) ---------------- */
  function PillValue({ value }: { value: string | number }) {
    const text = typeof value === "number" ? String(value) : value;
    const tight = text.length >= 6; // catches "100.0%" etc

    return (
      <div className="pillValue">
        <span className={`chipValueText ${tight ? "chipValueText--tight" : "chipValueText--fit"}`}>{text}</span>
      </div>
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
  <button
    className="ghostBtn"
    type="button"
    onClick={() => setShowUndoConfirm(true)}
    disabled={!lastSavedEntry}
  >
    Undo
  </button>

  <button 
  className="ghostBtn" 
  onClick={shareMenu}
  >
  Share
</button>

  <button
    className="ghostBtn"
    type="button"
    onClick={() => setShowResetConfirm(true)}
  >
    Reset
  </button>
</div>
      </div>

      <div className="mainGrid">
        {/* LEFT: Live Game Tracker */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Live Game Tracker</div>
            </div>

            <button className="primaryBtn" type="button" onClick={() => setShowSaveConfirm(true)}>
              Save Game
            </button>
          </div>

          <div className="formGrid">
            <div className="field">
              <div className="label">DATE</div>
              <input className="input" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
            </div>
           
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
  {formatDateUS(date)}
</div>

            <div className="field">
              <div className="label">TEAM</div>
              <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Fly Academy" />
            </div>

            <div className="field">
              <div className="label">
                PLAYER NAME <span className="req">*</span>
              </div>
              <input className="input" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="ex: Jordan Smith" />
            </div>

            <div className="field">
              <div className="label">OPPONENT</div>
              <input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="ex: Team Alpha 14U" />
            </div>
          </div>

          {/* Live stat pills row 1 */}
          <div className="pillsRow">
            <div className="pill">
              <div className="pillLabel">PTS</div>
              <PillValue value={pts} />
            </div>

            <div className="pill">
              <div className="pillLabel">FG</div>
              <PillValue value={`${fgMade}-${fgAtt}`} />
            </div>

            <div className="pill">
              <div className="pillLabel">FG%</div>
              <PillValue value={fgPct} />
            </div>

            <div className="pill">
              <div className="pillLabel">3P FG</div>
              <PillValue value={`${threeMade}-${threeAtt}`} />
            </div>

            <div className="pill">
              <div className="pillLabel">3P FG%</div>
              <PillValue value={threePct} />
            </div>

            <div className="pill">
              <div className="pillLabel">FT</div>
              <PillValue value={`${ftMade}-${ftAtt}`} />
            </div>

            <div className="pill">
              <div className="pillLabel">FT%</div>
              <PillValue value={ftPct} />
            </div>
          </div>

          {/* Live stat pills row 2 */}
          <div className="pillsRow">
            <div className="pill">
              <div className="pillLabel">O REBS</div>
              <PillValue value={counts.orb} />
            </div>

            <div className="pill">
              <div className="pillLabel">D REBS</div>
              <PillValue value={counts.drb} />
            </div>

            <div className="pill">
              <div className="pillLabel">TTL REBS</div>
              <PillValue value={ttlReb} />
            </div>

            <div className="pill">
              <div className="pillLabel">AST</div>
              <PillValue value={counts.ast} />
            </div>

            <div className="pill">
              <div className="pillLabel">TO</div>
              <PillValue value={counts.to} />
            </div>

            <div className="pill">
              <div className="pillLabel">STLS</div>
              <PillValue value={counts.stl} />
            </div>

            <div className="pill">
              <div className="pillLabel">FOULS</div>
              <PillValue value={counts.pf} />
            </div>
          </div>

          <div className="sectionLabel">SCORING</div>
          <div className="tileGrid">
            <button className="tileBtn tileGood" type="button" onClick={() => inc("made2", 1)}>
              <div className="tileTop">+2</div>
              <div className="tileSub">Made 2PT</div>
            </button>

            <button className="tileBtn tileBad" type="button" onClick={() => inc("miss2", 1)}>
              <div className="tileTop">2 Miss</div>
              <div className="tileSub">Missed 2PT</div>
            </button>

            <button className="tileBtn tileGood" type="button" onClick={() => inc("made3", 1)}>
              <div className="tileTop">+3</div>
              <div className="tileSub">Made 3PT</div>
            </button>

            <button className="tileBtn tileBad" type="button" onClick={() => inc("miss3", 1)}>
              <div className="tileTop">3 Miss</div>
              <div className="tileSub">Missed 3PT</div>
            </button>

            <button
              className="tileBtn tileGood"
              type="button"
              onClick={() => {
                inc("ftm", 1);
                inc("fta", 1);
              }}
            >
              <div className="tileTop">+FT</div>
              <div className="tileSub">Made FT</div>
            </button>

            <button className="tileBtn tileBad" type="button" onClick={() => inc("fta", 1)}>
              <div className="tileTop">FT Miss</div>
              <div className="tileSub">Missed FT</div>
            </button>
          </div>

          <div className="sectionLabel">HUSTLE + OTHER</div>
          <div className="tileGrid">
            <button className="tileBtn tileHustle" type="button" onClick={() => inc("orb", 1)}>
              <div className="tileTop">ORB</div>
              <div className="tileSub">Off. Rebound</div>
            </button>

            <button className="tileBtn tileHustle" type="button" onClick={() => inc("drb", 1)}>
              <div className="tileTop">DRB</div>
              <div className="tileSub">Def. Rebound</div>
            </button>

            <button className="tileBtn tileHustle" type="button" onClick={() => inc("ast", 1)}>
              <div className="tileTop">AST</div>
              <div className="tileSub">Assist</div>
            </button>

            <button className="tileBtn tileHustle" type="button" onClick={() => inc("to", 1)}>
              <div className="tileTop">TO</div>
              <div className="tileSub">Turnover</div>
            </button>

            <button className="tileBtn tileHustle" type="button" onClick={() => inc("stl", 1)}>
              <div className="tileTop">STL</div>
              <div className="tileSub">Steal</div>
            </button>

            <button className="tileBtn tileHustle" type="button" onClick={() => inc("pf", 1)}>
              <div className="tileTop">FOUL</div>
              <div className="tileSub">Foul</div>
            </button>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <div className="label">NOTES</div>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>

          <div className="saveRow">
            <button className="primaryBtn" type="button" onClick={() => setShowSaveConfirm(true)}>
              Save Game
            </button>
          </div>

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

          {/* Team Logs (organizational + unlimited) */}
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

          {/* Season Summary (exact order, 8 rows x 2 columns) */}
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
                          {g.playerName} • {g.date}
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
      {showSaveConfirm ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Save &amp; Reset?</h2>
            <p>Saving this game will add it to the Player Log and reset the live tracker to 0. Continue?</p>

            <button className="primaryBtn" type="button" onClick={confirmSaveGame}>
              Save Game
            </button>
            <button className="ghostBtn" type="button" onClick={() => setShowSaveConfirm(false)}>
              Cancel
            </button>

            <div className="microHint">Tip: Use Save when the game is finished (or when you want to lock in a partial).</div>
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
{showShareConfirm && (
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

        <button
          className="ghostBtn"
          type="button"
          onClick={() => setShowShareConfirm(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

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
            <h2>Undo last save?</h2>
            <p>This will remove your most recently saved game from this device.</p>

            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                setShowUndoConfirm(false);
                undoLastSave();
              }}
              disabled={!lastSavedEntry}
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
            <h2>Unlock Saving</h2>
            <p>
              You&apos;ve used your {TRIAL_FREE_GAMES} free game saves. Upgrade to continue saving games and viewing season stats.
            </p>

            <button className="primaryBtn" type="button" onClick={() => startCheckout("single_game")}>
              Add This Game ($6.99)
            </button>

            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                setShowUpgrade(false);
                setShowSeasonPick(true);
              }}
            >
              Season Pass ($19.99)
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
              onClick={() => {
                if (!seasonPick) return;
                const w = getSeasonWindow(seasonPick);
                startCheckout("season", {
                  seasonKey: w.key,
                  seasonLabel: w.label,
                  accessStart: w.start,
                  accessEnd: w.end,
                  // Team Logs are organizational; still helpful to attach current context
                  teamLogIdAtPurchase: selectedTeamLogId || null,
                });
              }}
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
