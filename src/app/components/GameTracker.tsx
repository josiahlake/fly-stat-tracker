"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type LiveCounts = {
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;

  orb: number;
  drb: number;
  ast: number;
  to: number;
  stl: number;
  foul: number;
};

type GameEntry = {
  id: string;
  createdAt: number;
  date: string; // YYYY-MM-DD
  team: string;
  opponent: string;
  playerName: string;
  notes?: string;
  counts: LiveCounts;
};

type Entitlement = {
  plan: "free" | "season" | "monthly" | "annual";
  singleCredits: number; // credits for single game purchases
  updatedAt: number;
};

const STORAGE_GAMES = "fly_stat_tracker_games_v1";
const STORAGE_ENT = "fly_stat_tracker_entitlement_v1";

const emptyCounts: LiveCounts = {
  fg2m: 0,
  fg2a: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  to: 0,
  stl: 0,
  foul: 0,
};

const TRIAL_GAMES = 2; // allow 2 saved games per player for free; 3rd triggers paywall

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp0(n: number) {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function pct(m: number, a: number) {
  if (!a) return 0;
  return (m / a) * 100;
}

function sumCounts(gs: GameEntry[]): LiveCounts {
  return gs.reduce(
    (acc, g) => {
      const c = g.counts;
      (Object.keys(acc) as (keyof LiveCounts)[]).forEach((k) => {
        acc[k] += clamp0(c[k]);
      });
      return acc;
    },
    { ...emptyCounts }
  );
}

function pointsFromCounts(c: LiveCounts) {
  return c.fg2m * 2 + c.fg3m * 3 + c.ftm;
}

function fgMade(c: LiveCounts) {
  return c.fg2m + c.fg3m;
}
function fgAtt(c: LiveCounts) {
  return c.fg2a + c.fg3a;
}

export default function GameTracker() {
  // --- Core states you already had ---
  const [games, setGames] = useState<GameEntry[]>([]);
  const [counts, setCounts] = useState<LiveCounts>({ ...emptyCounts });

  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [showUpgrade, setShowUpgrade] = useState(false);

  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [lastTapId, setLastTapId] = useState<string | null>(null);
  const [history, setHistory] = useState<LiveCounts[]>([]);

  const mountedRef = useRef(false);

  // Stable tap flash timeout ref
  const tapTimeoutRef = useRef<number | null>(null);

  // Share UI + status
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "shared" | "error">("");
  const shareTimeoutRef = useRef<number | null>(null);

  // Entitlement state (localStorage)
  const [ent, setEnt] = useState<Entitlement>({
    plan: "free",
    singleCredits: 0,
    updatedAt: Date.now(),
  });

  // ----------------------------
  // Load from localStorage
  // ----------------------------
  useEffect(() => {
    mountedRef.current = true;

    const g = safeParse<GameEntry[]>(typeof window !== "undefined" ? localStorage.getItem(STORAGE_GAMES) : null, []);
    setGames(g);

    const e = safeParse<Entitlement>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_ENT) : null,
      { plan: "free", singleCredits: 0, updatedAt: Date.now() }
    );
    setEnt(e);

    // If no selected player yet, default to first existing player, else keep empty
    const players = Array.from(new Set(g.map((x) => x.playerName))).sort();
    if (players.length > 0) setSelectedPlayer(players[0]);

    // Handle Stripe success redirect (MVP: set local entitlement from query params)
    // Expecting: ?success=1&plan=single_game|season|monthly|annual
    try {
      const url = new URL(window.location.href);
      const success = url.searchParams.get("success");
      const plan = url.searchParams.get("plan") as Entitlement["plan"] | "single_game" | null;

      if (success === "1" && plan) {
        applyPurchaseFromReturn(plan);
        // clean URL
        url.searchParams.delete("success");
        url.searchParams.delete("plan");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // ignore
    }

    return () => {
      mountedRef.current = false;
      if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
      if (shareTimeoutRef.current) window.clearTimeout(shareTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist games
  useEffect(() => {
    if (!mountedRef.current) return;
    try {
      localStorage.setItem(STORAGE_GAMES, JSON.stringify(games));
    } catch {
      // ignore
    }
  }, [games]);

  // Persist entitlement
  useEffect(() => {
    if (!mountedRef.current) return;
    try {
      localStorage.setItem(STORAGE_ENT, JSON.stringify(ent));
    } catch {
      // ignore
    }
  }, [ent]);

  // ----------------------------
  // Derived: players list + selected games
  // ----------------------------
  const playerNames = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => set.add(g.playerName));
    return Array.from(set).sort();
  }, [games]);

  useEffect(() => {
    // if selectedPlayer becomes empty but we have players, default it
    if (!selectedPlayer && playerNames.length > 0) setSelectedPlayer(playerNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerNames.length]);

  const gamesForSelected = useMemo(() => {
    if (!selectedPlayer) return [];
    return games.filter((g) => g.playerName === selectedPlayer);
  }, [games, selectedPlayer]);

  const seasonTotals = useMemo(() => sumCounts(gamesForSelected), [gamesForSelected]);

  const gamesCountForSelected = gamesForSelected.length;

  // ----------------------------
  // Paywall logic
  // ----------------------------
  const isUnlimited = ent.plan === "monthly" || ent.plan === "annual";
  const isSeason = ent.plan === "season";
  const hasSingleCredit = ent.singleCredits > 0;

  const isPaid = isUnlimited || isSeason || hasSingleCredit;

  function applyPurchaseFromReturn(plan: Entitlement["plan"] | "single_game") {
    setEnt((prev) => {
      if (plan === "single_game") {
        return { ...prev, singleCredits: (prev.singleCredits || 0) + 1, updatedAt: Date.now() };
      }
      if (plan === "season") {
        return { plan: "season", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      if (plan === "monthly") {
        return { plan: "monthly", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      if (plan === "annual") {
        return { plan: "annual", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      return prev;
    });
  }

  async function startCheckout(plan: "single_game" | "season" | "monthly" | "annual") {
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Checkout failed.");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      alert("Checkout failed (no URL returned).");
    } catch {
      alert("Checkout failed (network error).");
    }
  }

  // ----------------------------
  // Tap feedback helper
  // ----------------------------
  function flashTap(id: string) {
    setLastTapId(id);
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        // light feedback
        // @ts-ignore
        navigator.vibrate?.(15);
      }
    } catch {
      // ignore
    }

    if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = window.setTimeout(() => setLastTapId(null), 140);
  }

  function bump(key: keyof LiveCounts, delta: number, tapId: string) {
    setHistory((h) => [{ ...counts }, ...h].slice(0, 50));
    setCounts((c) => ({ ...c, [key]: clamp0(c[key] + delta) }));
    flashTap(tapId);
  }

  // ----------------------------
  // Undo / Reset
  // ----------------------------
  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const [prev, ...rest] = h;
      setCounts(prev);
      return rest;
    });
  }

  function confirmResetLive() {
    const ok = window.confirm("Reset the live game counts?");
    if (ok) resetLive();
  }

  function resetLive() {
    setCounts({ ...emptyCounts });
    setHistory([]);
  }

  // ----------------------------
  // Save Game (THIS is where enforcement must happen)
  // ----------------------------
  const saveGame = () => {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

    // Count how many games are already saved for THIS player name
    const savedForPlayer = games.filter((g) => g.playerName === p).length;

    // If not paid, block saves beyond trial
    // Trial allows 2 saved games -> 3rd attempt triggers upgrade modal
    if (!isPaid && savedForPlayer >= TRIAL_GAMES) {
      setShowUpgrade(true);
      return; // IMPORTANT: stop here so the game does NOT save
    }

    // If using a single credit, consume it ONLY when saving a game while not on unlimited/season
    // (season/monthly/annual should not consume credits)
    const shouldConsumeSingle = !isUnlimited && !isSeason && ent.singleCredits > 0;

    const entry: GameEntry = {
      id: makeId(),
      createdAt: Date.now(),
      date: date || todayISO(),
      team: team.trim() || "Fly Academy",
      opponent: opponent.trim(),
      playerName: p,
      notes: notes.trim() || undefined,
      counts: { ...counts },
    };

    setGames((g) => [entry, ...g]);

    if (!selectedPlayer) setSelectedPlayer(p);

    if (shouldConsumeSingle) {
      setEnt((prev) => ({ ...prev, singleCredits: Math.max(0, (prev.singleCredits || 0) - 1), updatedAt: Date.now() }));
    }

    // Keep live counts running? (You previously kept them unless reset.)
    // If you prefer auto-reset after save, uncomment:
    // resetLive();
  };

  // ----------------------------
  // Delete saved game
  // ----------------------------
  function deleteGame(id: string) {
    const ok = window.confirm("Delete this saved game?");
    if (!ok) return;
    setGames((g) => g.filter((x) => x.id !== id));
  }

  // ----------------------------
  // Share (lean, season-to-date only)
  // ----------------------------
  function closeShareSoon() {
    if (shareTimeoutRef.current) window.clearTimeout(shareTimeoutRef.current);
    shareTimeoutRef.current = window.setTimeout(() => {
      setShareStatus("");
      setShareOpen(false);
    }, 1200);
  }

  async function shareSeasonToDate() {
    const name = selectedPlayer || playerName.trim() || "Player";
    const totals = seasonTotals;
    const gp = gamesForSelected.length;

    const text =
      `Fly Stat Tracker — Season to date\n` +
      `${name}\n` +
      `Games: ${gp}\n` +
      `PPG: ${(gp ? pointsFromCounts(totals) / gp : 0).toFixed(1)}\n` +
      `RPG: ${(gp ? (totals.orb + totals.drb) / gp : 0).toFixed(1)}\n` +
      `APG: ${(gp ? totals.ast / gp : 0).toFixed(1)}\n` +
      `FG: ${fgMade(totals)}-${fgAtt(totals)} (${pct(fgMade(totals), fgAtt(totals)).toFixed(1)}%)\n` +
      `3P: ${totals.fg3m}-${totals.fg3a} (${pct(totals.fg3m, totals.fg3a).toFixed(1)}%)\n` +
      `FT: ${totals.ftm}-${totals.fta} (${pct(totals.ftm, totals.fta).toFixed(1)}%)\n`;

    try {
      // Try native share first
      // @ts-ignore
      if (navigator?.share) {
        // @ts-ignore
        await navigator.share({ title: "Fly Stat Tracker", text });
        setShareStatus("shared");
        closeShareSoon();
        return;
      }

      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
      closeShareSoon();
    } catch {
      setShareStatus("error");
      closeShareSoon();
    }
  }

  // ----------------------------
  // Stats (live)
  // ----------------------------
  const livePTS = pointsFromCounts(counts);
  const liveFGM = fgMade(counts);
  const liveFGA = fgAtt(counts);
  const liveFGP = pct(liveFGM, liveFGA);
  const live3P = pct(counts.fg3m, counts.fg3a);
  const liveFTP = pct(counts.ftm, counts.fta);

  const liveOREB = counts.orb;
  const liveDREB = counts.drb;
  const liveTREB = counts.orb + counts.drb;

  // Season-to-date (selected player)
  const seasonGP = gamesForSelected.length || 0;
  const seasonPPG = seasonGP ? pointsFromCounts(seasonTotals) / seasonGP : 0;
  const seasonRPG = seasonGP ? (seasonTotals.orb + seasonTotals.drb) / seasonGP : 0;
  const seasonAPG = seasonGP ? seasonTotals.ast / seasonGP : 0;
  const seasonFGP = pct(fgMade(seasonTotals), fgAtt(seasonTotals));

  // ----------------------------
  // UI
  // ----------------------------
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">PREPARE FOR TAKEOFF</div>
          <div className="title">FLY STAT TRACKER</div>
          <div className="subtitle">Track your Player&apos;s stats for a game or for a season.</div>
        </div>

        <div className="topActions">
          <button className="ghostBtn" onClick={undo} type="button">
            Undo
          </button>
          <button className="ghostBtn" onClick={confirmResetLive} type="button">
            Reset
          </button>
          <button
            className="ghostBtn"
            onClick={() => {
              setShareOpen((s) => !s);
              setShareStatus("");
            }}
            type="button"
          >
            Share
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT: Live */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Live Game Tracker</div>
            </div>

            <button className="primaryBtn" onClick={saveGame} type="button">
              Save Game
            </button>
          </div>

          <div className="formGrid">
            <div className="field">
              <div className="label">DATE</div>
              <input className="input" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
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

          {/* LIVE TILES */}
          <div className="tilesWrap">
            {/* Row 1 (shooting): PTS | FG | FG% | 3P FG | 3P FG% | FT | FT% */}
            <div className="miniTiles">
              <div className="miniTile">
                <div className="miniLabel">PTS</div>
                <div className="miniValue">{livePTS}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">FG</div>
                <div className="miniValue">
                  {liveFGM}-{liveFGA}
                </div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">FG%</div>
                <div className="miniValue">{liveFGP.toFixed(1)}%</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">3P FG</div>
                <div className="miniValue">
                  {counts.fg3m}-{counts.fg3a}
                </div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">3P FG%</div>
                <div className="miniValue">{live3P.toFixed(1)}%</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">FT</div>
                <div className="miniValue">
                  {counts.ftm}-{counts.fta}
                </div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">FT%</div>
                <div className="miniValue">{liveFTP.toFixed(1)}%</div>
              </div>
            </div>

            {/* Row 2 (hustle): O REBS | D REBS | TTL REBS | AST | TO | STLS | FOULS */}
            <div className="miniTiles">
              <div className="miniTile">
                <div className="miniLabel">O REBS</div>
                <div className="miniValue">{liveOREB}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">D REBS</div>
                <div className="miniValue">{liveDREB}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">TTL REBS</div>
                <div className="miniValue">{liveTREB}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">AST</div>
                <div className="miniValue">{counts.ast}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">TO</div>
                <div className="miniValue">{counts.to}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">STLS</div>
                <div className="miniValue">{counts.stl}</div>
              </div>
              <div className="miniTile">
                <div className="miniLabel">FOULS</div>
                <div className="miniValue">{counts.foul}</div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="sectionLabel">SCORING</div>
          <div className="tileGrid">
            <button
              className={`tile blue ${lastTapId === "fg2m" ? "tap" : ""}`}
              onClick={() => {
                bump("fg2m", 1, "fg2m");
                bump("fg2a", 1, "fg2m_a");
              }}
              type="button"
            >
              <div className="tileTop">+2</div>
              <div className="tileSub">Made 2PT</div>
            </button>

            <button
              className={`tile red ${lastTapId === "fg2a" ? "tap" : ""}`}
              onClick={() => bump("fg2a", 1, "fg2a")}
              type="button"
            >
              <div className="tileTop">2 Miss</div>
              <div className="tileSub">Missed 2PT</div>
            </button>

            <button
              className={`tile blue ${lastTapId === "fg3m" ? "tap" : ""}`}
              onClick={() => {
                bump("fg3m", 1, "fg3m");
                bump("fg3a", 1, "fg3m_a");
              }}
              type="button"
            >
              <div className="tileTop">+3</div>
              <div className="tileSub">Made 3PT</div>
            </button>

            <button
              className={`tile red ${lastTapId === "fg3a" ? "tap" : ""}`}
              onClick={() => bump("fg3a", 1, "fg3a")}
              type="button"
            >
              <div className="tileTop">3 Miss</div>
              <div className="tileSub">Missed 3PT</div>
            </button>

            <button
              className={`tile blue ${lastTapId === "ftm" ? "tap" : ""}`}
              onClick={() => {
                bump("ftm", 1, "ftm");
                bump("fta", 1, "ftm_a");
              }}
              type="button"
            >
              <div className="tileTop">+FT</div>
              <div className="tileSub">Made FT</div>
            </button>

            <button className={`tile red ${lastTapId === "fta" ? "tap" : ""}`} onClick={() => bump("fta", 1, "fta")} type="button">
              <div className="tileTop">FT Miss</div>
              <div className="tileSub">Missed FT</div>
            </button>
          </div>

          <div className="sectionLabel">HUSTLE + OTHER</div>
          <div className="tileGrid">
            <button className={`tile grey ${lastTapId === "orb" ? "tap" : ""}`} onClick={() => bump("orb", 1, "orb")} type="button">
              <div className="tileTop">ORB</div>
              <div className="tileSub">Off. Rebound</div>
            </button>

            <button className={`tile grey ${lastTapId === "drb" ? "tap" : ""}`} onClick={() => bump("drb", 1, "drb")} type="button">
              <div className="tileTop">DRB</div>
              <div className="tileSub">Def. Rebound</div>
            </button>

            <button className={`tile grey ${lastTapId === "ast" ? "tap" : ""}`} onClick={() => bump("ast", 1, "ast")} type="button">
              <div className="tileTop">AST</div>
              <div className="tileSub">Assist</div>
            </button>

            <button className={`tile grey ${lastTapId === "to" ? "tap" : ""}`} onClick={() => bump("to", 1, "to")} type="button">
              <div className="tileTop">TO</div>
              <div className="tileSub">Turnover</div>
            </button>

            <button className={`tile grey ${lastTapId === "stl" ? "tap" : ""}`} onClick={() => bump("stl", 1, "stl")} type="button">
              <div className="tileTop">STL</div>
              <div className="tileSub">Steal</div>
            </button>

            <button className={`tile grey ${lastTapId === "foul" ? "tap" : ""}`} onClick={() => bump("foul", 1, "foul")} type="button">
              <div className="tileTop">FOUL</div>
              <div className="tileSub">Personal</div>
            </button>
          </div>

          <div className="sectionLabel">NOTES</div>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} />

          <div className="saveRow">
            <button className="primaryBtn" onClick={saveGame} type="button">
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
              <div className="cardHint">{gamesForSelected.length} games</div>
            </div>

            {shareOpen && (
              <button className="primaryBtn" onClick={shareSeasonToDate} type="button">
                {shareStatus === "copied" ? "Copied!" : shareStatus === "shared" ? "Shared!" : shareStatus === "error" ? "Error" : "Share Season"}
              </button>
            )}
          </div>

          <div className="field" style={{ marginTop: 6 }}>
            <div className="label">SELECT PLAYER</div>
            <select className="select" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}>
              {playerNames.length === 0 ? <option value="">No players yet</option> : null}
              {playerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="sectionLabel" style={{ marginTop: 10 }}>
            Season-to-date
          </div>

          <div className="seasonGrid">
            <div className="seasonTile">
              <div className="seasonLabel">PPG</div>
              <div className="seasonValue">{seasonPPG.toFixed(1)}</div>
            </div>

            <div className="seasonTile">
              <div className="seasonLabel">RPG</div>
              <div className="seasonValue">{seasonRPG.toFixed(1)}</div>
            </div>

            <div className="seasonTile">
              <div className="seasonLabel">APG</div>
              <div className="seasonValue">{seasonAPG.toFixed(1)}</div>
            </div>

            <div className="seasonTile">
              <div className="seasonLabel">FG%</div>
              <div className="seasonValue">{seasonFGP.toFixed(1)}%</div>
            </div>

            <div className="seasonHint">Tip: Save each game to update averages automatically.</div>
          </div>

          <div className="sectionLabel" style={{ marginTop: 10 }}>
            Games
          </div>

          <div className="gamesList">
            {gamesForSelected.length === 0 ? (
              <div className="emptyState">No saved games yet.</div>
            ) : (
              gamesForSelected.map((g) => {
                const c = g.counts;
                const PTS = pointsFromCounts(c);
                const FGM = fgMade(c);
                const FGA = fgAtt(c);
                const line = `PTS ${PTS} • FG ${FGM}-${FGA} • 3P ${c.fg3m}-${c.fg3a} • FT ${c.ftm}-${c.fta}`;

                return (
                  <div key={g.id} className="gameCard">
                    <div className="gameTop">
                      <div className="gameTitle">
                        {g.playerName} • {g.date}
                      </div>
                      <button className="deleteBtn" onClick={() => deleteGame(g.id)} type="button">
                        Delete
                      </button>
                    </div>

                    <div className="gameSub">{g.opponent ? `vs ${g.opponent} • ${line}` : line}</div>

                    <div className="gameStatsRow">
                      <div className="statPill">
                        <div className="statLabel">REB</div>
                        <div className="statValue">{c.orb + c.drb}</div>
                      </div>
                      <div className="statPill">
                        <div className="statLabel">AST</div>
                        <div className="statValue">{c.ast}</div>
                      </div>
                      <div className="statPill">
                        <div className="statLabel">STL</div>
                        <div className="statValue">{c.stl}</div>
                      </div>
                      <div className="statPill">
                        <div className="statLabel">FOUL</div>
                        <div className="statValue">{c.foul}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="footnote">Saved games are stored locally on this device.</div>
        </div>
      </div>

      {/* PAYWALL / UPGRADE MODAL */}
      {showUpgrade && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div className="modalHeader">
              <div className="modalTitle">Upgrade to keep saving</div>
              <button className="modalClose" onClick={() => setShowUpgrade(false)} type="button" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="modalText">
                You’ve reached the free limit of <b>{TRIAL_GAMES} saved games</b> for this player.
                <br />
                Choose a plan to continue saving games.
              </div>

              <div className="modalGrid">
                <button className="primaryBtn" onClick={() => startCheckout("single_game")} type="button">
                  Single Game
                </button>
                <button className="primaryBtn" onClick={() => startCheckout("season")} type="button">
                  Season Pass
                </button>
                <button className="primaryBtn" onClick={() => startCheckout("monthly")} type="button">
                  Unlimited Monthly
                </button>
                <button className="primaryBtn" onClick={() => startCheckout("annual")} type="button">
                  Unlimited Annual
                </button>
              </div>

              <div className="modalFinePrint">
                Already purchased? If you just completed checkout, return here and refresh once.
              </div>

              <div className="modalActions">
                <button className="ghostBtn" onClick={() => setShowUpgrade(false)} type="button">
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Minimal CSS hooks (uses your existing globals if present). If you already style these classes, you can remove this block. */}
      <style jsx>{`
        .page {
          padding: 22px 18px 36px;
        }
        .topbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .eyebrow {
          letter-spacing: 0.12em;
          font-size: 11px;
          opacity: 0.6;
        }
        .title {
          font-size: 28px;
          font-weight: 800;
          margin-top: 2px;
        }
        .subtitle {
          margin-top: 4px;
          opacity: 0.65;
        }
        .topActions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          align-items: start;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        .card {
          background: #fff;
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
        }
        .cardHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          margin-bottom: 8px;
        }
        .cardTitle {
          font-weight: 800;
        }
        .cardHint {
          opacity: 0.6;
          font-size: 12px;
          margin-top: 2px;
        }

        .formGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 10px 0 12px;
        }
        @media (max-width: 520px) {
          .formGrid {
            grid-template-columns: 1fr;
          }
        }
        .field .label {
          font-size: 11px;
          opacity: 0.7;
          margin-bottom: 6px;
          letter-spacing: 0.08em;
        }
        .req {
          color: #d00;
        }
        .input,
        .select,
        .textarea {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 10px;
          padding: 10px 10px;
          outline: none;
          font-size: 14px;
        }
        .textarea {
          resize: vertical;
        }

        .primaryBtn {
          background: #111;
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .ghostBtn {
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111;
          border-radius: 999px;
          padding: 10px 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .tilesWrap {
          margin: 10px 0 10px;
        }
        .miniTiles {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          margin-bottom: 8px;
        }
        @media (max-width: 980px) {
          .miniTiles {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .miniTile {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 10px;
        }
        .miniLabel {
          font-size: 10px;
          opacity: 0.6;
          letter-spacing: 0.1em;
        }
        .miniValue {
          font-size: 16px;
          font-weight: 800;
          margin-top: 4px;
        }

        .sectionLabel {
          font-size: 11px;
          letter-spacing: 0.1em;
          opacity: 0.7;
          margin: 12px 0 8px;
        }

        .tileGrid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .tile {
          border: none;
          border-radius: 16px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          color: #fff;
          transition: transform 0.06s ease, filter 0.06s ease;
        }
        .tile.tap {
          transform: scale(0.985);
          filter: brightness(1.03);
        }
        .tileTop {
          font-size: 18px;
          font-weight: 900;
        }
        .tileSub {
          margin-top: 4px;
          opacity: 0.85;
          font-size: 12px;
        }
        .tile.blue {
          background: #5f8fa9;
        }
        .tile.red {
          background: #c84d44;
        }
        .tile.grey {
          background: #6a95ad;
        }

        .saveRow {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }
        .microHint {
          margin-top: 8px;
          font-size: 12px;
          opacity: 0.6;
        }

        .seasonGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 8px;
        }
        .seasonTile {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 12px;
        }
        .seasonLabel {
          font-size: 10px;
          opacity: 0.6;
          letter-spacing: 0.1em;
        }
        .seasonValue {
          font-size: 20px;
          font-weight: 900;
          margin-top: 4px;
        }
        .seasonHint {
          grid-column: 1 / -1;
          font-size: 12px;
          opacity: 0.6;
          margin-top: 2px;
        }

        .gamesList {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .emptyState {
          opacity: 0.6;
          padding: 12px 0;
        }
        .gameCard {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 14px;
          padding: 12px;
        }
        .gameTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .gameTitle {
          font-weight: 900;
        }
        .deleteBtn {
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          border-radius: 999px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 700;
        }
        .gameSub {
          margin-top: 6px;
          opacity: 0.7;
          font-size: 12px;
        }
        .gameStatsRow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 10px;
        }
        .statPill {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 10px;
        }
        .statLabel {
          font-size: 10px;
          opacity: 0.6;
          letter-spacing: 0.1em;
        }
        .statValue {
          font-size: 16px;
          font-weight: 900;
          margin-top: 4px;
        }
        .footnote {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.55;
        }

        /* Modal */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 9999;
        }
        .modalCard {
          width: 100%;
          max-width: 520px;
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);
          overflow: hidden;
        }
        .modalHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 14px 10px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }
        .modalTitle {
          font-weight: 900;
          font-size: 16px;
        }
        .modalClose {
          border: none;
          background: transparent;
          font-size: 18px;
          cursor: pointer;
          opacity: 0.75;
        }
        .modalBody {
          padding: 14px;
        }
        .modalText {
          opacity: 0.85;
          line-height: 1.35;
        }
        .modalGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 14px;
        }
        .modalFinePrint {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.6;
        }
        .modalActions {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
}
