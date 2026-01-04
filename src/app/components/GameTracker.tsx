"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Fly Stat Tracker (Single Player)
 * - Tap big buttons during game (made/miss 2PT, 3PT, FT + ORB/DRB/AST/TO/STL/FOUL)
 * - Save game (stored locally)
 * - Player Log: season-to-date averages + per-game list (filter by player)
 * - Two horizontal tile rows (7 across on desktop; responsive on phone)
 * - Tap feedback: quick flash (no vibration toggle UI)
 * - Undo + Reset safety confirmations
 * - Share: choose "Share Current Game" or "Share Overall Season" (lean season summary)
 */

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

type Action =
  | { kind: "inc"; key: keyof LiveCounts }
  | { kind: "dec"; key: keyof LiveCounts }
  | { kind: "reset" };

const STORAGE_KEY = "flyStatTracker.games.v2";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function safeParse<T>(json: string | null, fallback: T): T {
  try {
    if (!json) return fallback;
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function pct(made: number, att: number) {
  if (!att) return 0;
  return (made / att) * 100;
}

function formatPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampNonNeg(n: number) {
  return Math.max(0, n);
}

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

function sumCounts(a: LiveCounts, b: LiveCounts): LiveCounts {
  const out: any = {};
  (Object.keys(emptyCounts) as (keyof LiveCounts)[]).forEach((k) => {
    out[k] = a[k] + b[k];
  });
  return out as LiveCounts;
}

function avg(numerator: number, denom: number) {
  if (!denom) return 0;
  return numerator / denom;
}

function StatChip({ label, value }: { label: string; value: React.ReactNode }) {
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
    (tone === "good" ? "tapBtnGood " : "") +
    (tone === "bad" ? "tapBtnBad " : "tapBtnNeutral ") +
    (activeId === id ? "tapBtnActive" : "");

  return (
    <button className={cls} onClick={onTap} type="button">
      <div className="tapBtnTitle">{title}</div>
      <div className="tapBtnSub">{sub}</div>
    </button>
  );
}

export default function GameTracker() {
  const [games, setGames] = useState<GameEntry[]>([]);
  const [counts, setCounts] = useState<LiveCounts>({ ...emptyCounts });

  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [lastTapId, setLastTapId] = useState<string | null>(null);
  const [history, setHistory] = useState<Action[]>([]);

  const mountedRef = useRef(false);

  // Stable tap flash timeout
  const tapTimeoutRef = useRef<number | null>(null);

  // Share UI + status
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "shared" | "error">("");
  const shareTimeoutRef = useRef<number | null>(null);

  // Keep last saved entry (so Share Current Game can fall back if live is empty)
  const [lastSavedEntry, setLastSavedEntry] = useState<GameEntry | null>(null);

  // Load games once
  useEffect(() => {
    const loaded = safeParse<GameEntry[]>(
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
      []
    );
    setGames(Array.isArray(loaded) ? loaded : []);
    mountedRef.current = true;
  }, []);

  // Persist games
  useEffect(() => {
    if (!mountedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }, [games]);

  // Keep selected player sensible
  useEffect(() => {
    const names = Array.from(new Set(games.map((g) => g.playerName).filter(Boolean))).sort();
    const fallback = playerName.trim() || names[0] || "";
    if (!selectedPlayer) setSelectedPlayer(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  // Derived stats (live)
  const scoring = useMemo(() => {
    const fgm = counts.made2 + counts.made3;
    const fga = counts.made2 + counts.miss2 + counts.made3 + counts.miss3;

    const tpm = counts.made3;
    const tpa = counts.made3 + counts.miss3;

    const ftm = counts.madeFT;
    const fta = counts.madeFT + counts.missFT;

    const pts = counts.made2 * 2 + counts.made3 * 3 + counts.madeFT;

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

  const ttlRebs = counts.orb + counts.drb;

  // Player list + selected games
  const playerNames = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.playerName?.trim()) set.add(g.playerName.trim());
    });
    if (playerName.trim()) set.add(playerName.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games, playerName]);

  const gamesForSelected = useMemo(() => {
    const p = selectedPlayer.trim();
    if (!p) return [];
    return games
      .filter((g) => g.playerName.trim() === p)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [games, selectedPlayer]);

  // Season-to-date aggregates (selected player)
  const season = useMemo(() => {
    const total = gamesForSelected.reduce(
      (acc, g) => sumCounts(acc, g.counts),
      { ...emptyCounts }
    );
    const n = gamesForSelected.length;

    const fgm = total.made2 + total.made3;
    const fga = total.made2 + total.miss2 + total.made3 + total.miss3;

    const tpm = total.made3;
    const tpa = total.made3 + total.miss3;

    const ftm = total.madeFT;
    const fta = total.madeFT + total.missFT;

    const pts = total.made2 * 2 + total.made3 * 3 + total.madeFT;

    const rpg = avg(total.orb + total.drb, n);
    const orbg = avg(total.orb, n);
    const drbg = avg(total.drb, n);

    return {
      games: n,
      total,
      ppg: avg(pts, n),
      rpg,
      orbg,
      drbg,
      apg: avg(total.ast, n),
      topg: avg(total.to, n),
      stlg: avg(total.stl, n),
      pfpg: avg(total.pf, n),
      fgPct: pct(fgm, fga),
      tpPct: pct(tpm, tpa),
      ftPct: pct(ftm, fta),
    };
  }, [gamesForSelected]);

  const hasAnyLiveCounts = (c: LiveCounts) =>
    (Object.keys(emptyCounts) as (keyof LiveCounts)[]).some((k) => c[k] > 0);

  // --- Tap feedback ---
  const tapFeedback = (id: string) => {
    setLastTapId(id);
    if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = window.setTimeout(() => setLastTapId(null), 120);

    // Optional subtle vibration (always-on if device supports; no UI toggle)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        // @ts-ignore
        navigator.vibrate(12);
      } catch {}
    }
  };

  // --- Actions ---
  const inc = (key: keyof LiveCounts, tapId: string) => {
    tapFeedback(tapId);
    setCounts((c) => ({ ...c, [key]: c[key] + 1 }));
    setHistory((h) => [...h, { kind: "inc", key }]);
  };

  const dec = (key: keyof LiveCounts) => {
    setCounts((c) => ({ ...c, [key]: clampNonNeg(c[key] - 1) }));
    setHistory((h) => [...h, { kind: "dec", key }]);
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];

      setCounts((c) => {
        if (last.kind === "inc") {
          return { ...c, [last.key]: clampNonNeg(c[last.key] - 1) };
        }
        if (last.kind === "dec") {
          return { ...c, [last.key]: c[last.key] + 1 };
        }
        if (last.kind === "reset") {
          return c;
        }
        return c;
      });

      return h.slice(0, -1);
    });
  };

  const resetLive = () => {
    setCounts({ ...emptyCounts });
    setHistory((h) => [...h, { kind: "reset" }]);
  };

  const describeAction = (a: Action) => {
    if (a.kind === "reset") return "Reset";
    const pretty = String(a.key).toUpperCase();
    return a.kind === "inc" ? `+${pretty}` : `-${pretty}`;
  };

  const confirmUndo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    const ok = window.confirm(
      `Undo last action: ${describeAction(last)}?\n\nThis will revert your most recent tap.`
    );
    if (ok) undo();
  };

  const confirmReset = () => {
    const hasStats =
      (Object.values(counts) as number[]).some((v) => Number(v) > 0) || history.length > 0;

    if (!hasStats) return;

    const who = (playerName || "").trim() || "this player";
    const ok = window.confirm(
      `Are you sure you want to clear ${who}'s live stats?\n\nThis will NOT delete saved games.`
    );
    if (ok) resetLive();
  };

  const saveGame = () => {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

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
    setSelectedPlayer(p);
    setLastSavedEntry(entry);

    resetLive();
  };

  const deleteGame = (id: string) => {
    setGames((g) => g.filter((x) => x.id !== id));
    setLastSavedEntry((prev) => (prev?.id === id ? null : prev));
  };

  // ---------- SHARE (text) ----------
  const buildShareTextCurrentGame = (entry: GameEntry) => {
    const c = entry.counts;

    const fgm = c.made2 + c.made3;
    const fga = c.made2 + c.miss2 + c.made3 + c.miss3;
    const tpm = c.made3;
    const tpa = c.made3 + c.miss3;
    const ftm = c.madeFT;
    const fta = c.madeFT + c.missFT;
    const pts = c.made2 * 2 + c.made3 * 3 + c.madeFT;

    const ttl = c.orb + c.drb;

    const lines: string[] = [];
    lines.push(`Fly Stat Tracker — Current Game`);
    lines.push(`${entry.playerName}${entry.date ? ` • ${entry.date}` : ""}`);

    const metaParts: string[] = [];
    if (entry.opponent?.trim()) metaParts.push(`vs ${entry.opponent.trim()}`);
    if (entry.team?.trim()) metaParts.push(entry.team.trim());
    if (metaParts.length) lines.push(metaParts.join(" • "));

    lines.push(``);
    lines.push(`PTS ${pts}`);
    lines.push(`FG ${fgm}-${fga} (${formatPct(pct(fgm, fga))})`);
    lines.push(`3P ${tpm}-${tpa} (${formatPct(pct(tpm, tpa))})`);
    lines.push(`FT ${ftm}-${fta} (${formatPct(pct(ftm, fta))})`);
    lines.push(``);
    lines.push(
      `REB ${ttl} (O ${c.orb} / D ${c.drb})  AST ${c.ast}  TO ${c.to}  STL ${c.stl}  PF ${c.pf}`
    );

    if (entry.notes?.trim()) {
      lines.push(``);
      lines.push(`Notes: ${entry.notes.trim()}`);
    }

    return lines.join("\n");
  };

  const buildShareTextSeasonLean = (player: string) => {
    const p = player.trim();
    const n = gamesForSelected.length;

    if (!p) return `Fly Stat Tracker — Season Summary\n\nNo player selected.`;
    if (!n) return `Fly Stat Tracker — Season Summary\n\n${p}: No saved games yet.`;

    const lines: string[] = [];
    lines.push(`Fly Stat Tracker — Season Summary`);
    lines.push(`${p} • ${n} games`);
    lines.push(``);
    lines.push(`Averages per game:`);
    lines.push(
      `PPG ${season.ppg.toFixed(1)}  RPG ${season.rpg.toFixed(1)}  APG ${season.apg.toFixed(1)}`
    );
    lines.push(
      `FG% ${formatPct(season.fgPct)}  3P% ${formatPct(season.tpPct)}  FT% ${formatPct(season.ftPct)}`
    );
    lines.push(
      `ORB/G ${season.orbg.toFixed(1)}  DRB/G ${season.drbg.toFixed(1)}  STL/G ${season.stlg.toFixed(
        1
      )}  TO/G ${season.topg.toFixed(1)}`
    );

    return lines.join("\n");
  };

  const doShareText = async (text: string) => {
    try {
      setShareStatus("");
      if (shareTimeoutRef.current) window.clearTimeout(shareTimeoutRef.current);

      const navAny = navigator as any;

      if (navAny?.share) {
        await navAny.share({ title: "Fly Stat Tracker", text });
        setShareStatus("shared");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareStatus("copied");
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setShareStatus("copied");
      }

      shareTimeoutRef.current = window.setTimeout(() => setShareStatus(""), 1600);
    } catch {
      setShareStatus("error");
      shareTimeoutRef.current = window.setTimeout(() => setShareStatus(""), 1600);
    }
  };

  const shareCurrentGame = async () => {
    const pName = playerName.trim() || selectedPlayer.trim() || lastSavedEntry?.playerName || "Player";

    const draft: GameEntry = {
      id: "draft",
      createdAt: Date.now(),
      date: date || todayISO(),
      team: team.trim() || "Fly Academy",
      opponent: opponent.trim(),
      playerName: pName,
      notes: notes.trim() || undefined,
      counts: { ...counts },
    };

    // Prefer live if any counts; otherwise fall back to last saved
    const entryToShare = hasAnyLiveCounts(counts) ? draft : lastSavedEntry ?? draft;

    await doShareText(buildShareTextCurrentGame(entryToShare));
  };

  const shareSeason = async () => {
    const p = selectedPlayer.trim() || playerName.trim();
    await doShareText(buildShareTextSeasonLean(p));
  };

  return (
    <div className="page">
      <div className="topBar">
        <div>
          <div className="kicker">PREPARE FOR TAKEOFF</div>
          <h1 className="title">FLY STAT TRACKER</h1>
          <div className="subtitle">Track your Player's stats for a game or for a season.</div>
        </div>

        <div className="topActions">
          <button className="ghostBtn" onClick={confirmUndo} type="button" disabled={!history.length}>
            Undo
          </button>

          <button className="ghostBtn" onClick={confirmReset} type="button">
            Reset
          </button>

          <button className="ghostBtn" onClick={() => setShareOpen(true)} type="button">
            Share
            {shareStatus ? (
              <span className="pill" aria-live="polite">
                {shareStatus === "copied" ? "Copied" : shareStatus === "shared" ? "Shared" : "Error"}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {shareOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Share options">
          <div className="modal">
            <div className="modalTitle">Share</div>
            <div className="modalHint">Choose what you want to share</div>

            <div className="modalButtons">
              <button
                className="modalBtn"
                type="button"
                onClick={async () => {
                  setShareOpen(false);
                  await shareCurrentGame();
                }}
              >
                Share Current Game
              </button>

              <button
                className="modalBtn"
                type="button"
                onClick={async () => {
                  setShareOpen(false);
                  await shareSeason();
                }}
                disabled={!selectedPlayer.trim() && !playerName.trim()}
                title={!selectedPlayer.trim() && !playerName.trim() ? "Select or enter a player first" : ""}
              >
                Share Overall Season
              </button>

              <button className="modalBtnSecondary" type="button" onClick={() => setShareOpen(false)}>
                Cancel
              </button>
            </div>

            <div className="modalMicro">Tip: “Season” uses saved games for the selected player.</div>
          </div>
        </div>
      ) : null}

      <div className="grid">
        {/* LEFT: Live game tracker */}
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
              <input
                className="input"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ex: Jordan Smith"
              />
            </div>

            <div className="field">
              <div className="label">OPPONENT</div>
              <input
                className="input"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="ex: Team Alpha 14U"
              />
            </div>
          </div>

          {/* STAT TILES — TWO HORIZONTAL ROWS (7 across) */}
          <div className="statTilesWrap">
            <div className="statTilesRow">
              <StatChip label="PTS" value={scoring.pts} />
              <StatChip label="FG" value={`${scoring.fgm}-${scoring.fga}`} />
              <StatChip label="FG%" value={formatPct(scoring.fgPct)} />
              <StatChip label="3P FG" value={`${scoring.tpm}-${scoring.tpa}`} />
              <StatChip label="3P FG%" value={formatPct(scoring.tpPct)} />
              <StatChip label="FT" value={`${scoring.ftm}-${scoring.fta}`} />
              <StatChip label="FT%" value={formatPct(scoring.ftPct)} />
            </div>

            <div className="statTilesRow statTilesRow2">
              <StatChip label="O REBS" value={counts.orb} />
              <StatChip label="D REBS" value={counts.drb} />
              <StatChip label="TTL REBS" value={ttlRebs} />
              <StatChip label="AST" value={counts.ast} />
              <StatChip label="TO" value={counts.to} />
              <StatChip label="STLS" value={counts.stl} />
              <StatChip label="FOULS" value={counts.pf} />
            </div>
          </div>

          <div className="sectionLabel">SCORING</div>
          <div className="btnGrid2">
            <TapButton id="made2" activeId={lastTapId} tone="good" title="+2" sub="Made 2PT" onTap={() => inc("made2", "made2")} />
            <TapButton id="miss2" activeId={lastTapId} tone="bad" title="2 Miss" sub="Missed 2PT" onTap={() => inc("miss2", "miss2")} />
            <TapButton id="made3" activeId={lastTapId} tone="good" title="+3" sub="Made 3PT" onTap={() => inc("made3", "made3")} />
            <TapButton id="miss3" activeId={lastTapId} tone="bad" title="3 Miss" sub="Missed 3PT" onTap={() => inc("miss3", "miss3")} />
            <TapButton id="madeFT" activeId={lastTapId} tone="good" title="+FT" sub="Made FT" onTap={() => inc("madeFT", "madeFT")} />
            <TapButton id="missFT" activeId={lastTapId} tone="bad" title="FT Miss" sub="Missed FT" onTap={() => inc("missFT", "missFT")} />
          </div>

          <div className="sectionLabel" style={{ marginTop: 14 }}>
            HUSTLE + OTHER
          </div>
          <div className="btnGrid3">
            <TapButton id="orb" activeId={lastTapId} tone="neutral" title="ORB" sub="Off. Rebound" onTap={() => inc("orb", "orb")} />
            <TapButton id="drb" activeId={lastTapId} tone="neutral" title="DRB" sub="Def. Rebound" onTap={() => inc("drb", "drb")} />
            <TapButton id="ast" activeId={lastTapId} tone="neutral" title="AST" sub="Assist" onTap={() => inc("ast", "ast")} />
            <TapButton id="to" activeId={lastTapId} tone="neutral" title="TO" sub="Turnover" onTap={() => inc("to", "to")} />
            <TapButton id="stl" activeId={lastTapId} tone="neutral" title="STL" sub="Steal" onTap={() => inc("stl", "stl")} />
            <TapButton id="pf" activeId={lastTapId} tone="neutral" title="FOUL" sub="Personal" onTap={() => inc("pf", "pf")} />
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <div className="label">NOTES</div>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
            />
          </div>
          <div className="saveRow">
  <button className="primaryBtn" onClick={saveGame} type="button">
    Save Game
  </button>
</div>

          <div className="microHint">Tip: Use Save to lock in games for season stats.</div>
        </div>

        {/* RIGHT: Player log */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Player Log</div>
              <div className="cardHint">{season.games} games</div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 6 }}>
            <div className="label">SELECT PLAYER</div>
            <select className="select" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}>
              {playerNames.length === 0 ? (
                <option value="">No players yet</option>
              ) : (
                playerNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="sectionHeader">Season-to-date</div>

          <div className="seasonGrid">
            <div className="seasonChip">
              <div className="seasonLabel">PPG</div>
              <div className="seasonValue">{season.ppg.toFixed(1)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">RPG</div>
              <div className="seasonValue">{season.rpg.toFixed(1)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">APG</div>
              <div className="seasonValue">{season.apg.toFixed(1)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">FG%</div>
              <div className="seasonValue">{formatPct(season.fgPct)}</div>
            </div>

            <div className="seasonChip">
              <div className="seasonLabel">3P%</div>
              <div className="seasonValue">{formatPct(season.tpPct)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">FT%</div>
              <div className="seasonValue">{formatPct(season.ftPct)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">ORB/G</div>
              <div className="seasonValue">{season.orbg.toFixed(1)}</div>
            </div>
            <div className="seasonChip">
              <div className="seasonLabel">DRB/G</div>
              <div className="seasonValue">{season.drbg.toFixed(1)}</div>
            </div>
          </div>

          <div className="microHint" style={{ marginTop: 10 }}>
            Tip: Save each game to update averages automatically.
          </div>

          <div className="sectionHeader" style={{ marginTop: 16 }}>
            Games
          </div>

          {gamesForSelected.length === 0 ? (
            <div className="emptyBox">No games saved for this player yet.</div>
          ) : (
            <div className="gamesList">
              {gamesForSelected.map((g) => {
                const fgm = g.counts.made2 + g.counts.made3;
                const fga = g.counts.made2 + g.counts.miss2 + g.counts.made3 + g.counts.miss3;
                const tpm = g.counts.made3;
                const tpa = g.counts.made3 + g.counts.miss3;
                const ftm = g.counts.madeFT;
                const fta = g.counts.madeFT + g.counts.missFT;
                const pts = g.counts.made2 * 2 + g.counts.made3 * 3 + g.counts.madeFT;

                return (
                  <div key={g.id} className="gameCard">
                    <div className="gameTop">
                      <div className="gameTitle">
                        {g.playerName} • {g.date}
                      </div>
                      <button className="miniBtn" onClick={() => deleteGame(g.id)} type="button">
                        Delete
                      </button>
                    </div>
                    <div className="gameMeta">
                      {g.opponent ? `vs ${g.opponent} • ` : ""}
                      PTS {pts} • FG {fgm}-{fga} • 3P {tpm}-{tpa} • FT {ftm}-{fta}
                    </div>

                    <div className="miniGrid">
                      <div className="miniChip">
                        <div className="miniLabel">REB</div>
                        <div className="miniValue">{g.counts.orb + g.counts.drb}</div>
                      </div>
                      <div className="miniChip">
                        <div className="miniLabel">AST</div>
                        <div className="miniValue">{g.counts.ast}</div>
                      </div>
                      <div className="miniChip">
                        <div className="miniLabel">STL</div>
                        <div className="miniValue">{g.counts.stl}</div>
                      </div>
                      <div className="miniChip">
                        <div className="miniLabel">FOUL</div>
                        <div className="miniValue">{g.counts.pf}</div>
                      </div>
                    </div>

                    {g.notes ? <div className="gameNotes">{g.notes}</div> : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="microHint" style={{ marginTop: 12 }}>
            Saved games are stored locally on this device.
          </div>
        </div>
      </div>

      <style>{`
        :root{
          --bg:#f6f6f4;
          --card:#ffffff;
          --ink:#0b0b0b;
          --muted:rgba(0,0,0,.55);
          --line:rgba(0,0,0,.12);
          --shadow:0 10px 25px rgba(0,0,0,.06);
          --radius:18px;

          /* Fly-ish tones */
          --good:#0b6b66;     /* deep teal */
          --bad:#d0482e;      /* fly red/orange */
          --neutral:#7ea6bf;  /* cool blue */
        }

        .page{
          padding: 28px 18px 40px;
          background: var(--bg);
          min-height: 100vh;
          color: var(--ink);
          font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        }

        .topBar{
          max-width: 1120px;
          margin: 0 auto 18px;
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
        }

        .kicker{
          letter-spacing: .18em;
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .title{
          margin: 0;
          font-size: 34px;
          line-height: 1.08;
        }

        .subtitle{
          margin-top: 8px;
          color: var(--muted);
          font-size: 14px;
        }

        .topActions{
          display:flex;
          gap:10px;
          flex-wrap: wrap;
          justify-content:flex-end;
          align-items: center;
        }

        .ghostBtn{
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
        }
        .ghostBtn:disabled{
          opacity:.45;
          cursor:not-allowed;
        }

        .pill{
          display:inline-block;
          margin-left: 8px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.9);
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }

        .grid{
          max-width: 1120px;
          margin: 0 auto;
          display:grid;
          grid-template-columns: 1.1fr .9fr;
          gap: 18px;
          align-items:start;
        }

        @media (max-width: 980px){
          .grid{ grid-template-columns: 1fr; }
        }

        .card{
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 18px;
        }

        .cardHeader{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom: 10px;
        }

        .cardTitle{
          font-weight: 800;
          font-size: 16px;
        }

        .cardHint{
          color: var(--muted);
          font-size: 12px;
          margin-top: 2px;
        }

        .primaryBtn{
          background: var(--ink);
          color: #fff;
          border: 0;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .formGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        @media (max-width: 520px){
          .formGrid{ grid-template-columns: 1fr; }
        }

        .field .label{
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
          margin-bottom: 6px;
        }

        .req{ color: var(--bad); font-weight: 800; }

        .input, .select, .textarea{
          width:100%;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 12px;
          font-size: 14px;
          outline: none;
          background: #fff;
        }

        .textarea{ resize: vertical; }

        /* --- STAT TILES (two horizontal rows, 7 across) --- */
        .statTilesWrap { margin-top: 14px; }

        .statTilesRow {
          display: grid !important;
          grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
          gap: 10px;
          align-items: stretch;
        }

        .statTilesRow2 { margin-top: 10px; }

        .statTilesRow > * {
          width: auto !important;
          min-width: 0 !important;
        }

        @media (max-width: 900px) {
          .statTilesRow { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        }

        @media (max-width: 520px) {
          .statTilesRow { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }

        .chip{
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 10px;
          background: #fff;
          min-height: 54px;
          display:flex;
          flex-direction:column;
          justify-content:center;
        }

        .chipLabel{
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
          white-space: nowrap;
        }

        .chipValue{
          margin-top: 2px;
          font-size: 18px;
          font-weight: 800;
          white-space: nowrap;
        }

        .sectionLabel{
          margin-top: 14px;
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
        }

        .btnGrid2{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        .btnGrid3{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        /* Mobile tap optimizations */
        .tapBtn, .ghostBtn, .primaryBtn, .miniBtn, .modalBtn, .modalBtnSecondary{
          touch-action: manipulation;
        }

        .tapBtn{
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .saveRow{
  margin-top: 12px;
  display:flex;
  justify-content:flex-end;
}

        .tapBtn{
          border: 0;
          border-radius: 18px;
          padding: 16px 16px;
          cursor: pointer;
          color: #fff;
          text-align:left;
          min-height: 84px;

          transition: transform 80ms ease, filter 120ms ease;
          box-shadow: 0 10px 20px rgba(0,0,0,.10);
        }

        .tapBtnTitle{
          font-size: 22px;
          font-weight: 900;
          letter-spacing: .02em;
        }

        .tapBtnSub{
          margin-top: 6px;
          font-size: 13px;
          opacity: .92;
        }

        .tapBtnGood{ background: var(--good); }
        .tapBtnBad{ background: var(--bad); }
        .tapBtnNeutral{ background: var(--neutral); }

        .tapBtnActive{
          filter: brightness(1.15);
          transform: scale(0.98);
        }

        .microHint{
          margin-top: 12px;
          font-size: 12px;
          color: rgba(0,0,0,.55);
        }

        .sectionHeader{
          margin-top: 14px;
          font-weight: 900;
          font-size: 14px;
        }

        .seasonGrid{
          margin-top: 10px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .seasonChip{
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px;
          background: #fff;
        }

        .seasonLabel{
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
        }

        .seasonValue{
          margin-top: 4px;
          font-size: 20px;
          font-weight: 900;
        }

        .emptyBox{
          margin-top: 10px;
          border: 1px dashed var(--line);
          border-radius: 14px;
          padding: 14px;
          color: rgba(0,0,0,.55);
          background: rgba(255,255,255,.65);
        }

        .gamesList{ margin-top: 10px; display:flex; flex-direction:column; gap: 10px; }

        .gameCard{
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px;
          background: #fff;
        }

        .gameTop{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
        }

        .gameTitle{ font-weight: 900; }

        .miniBtn{
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .gameMeta{
          margin-top: 4px;
          color: rgba(0,0,0,.6);
          font-size: 12px;
        }

        .miniGrid{
          margin-top: 10px;
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .miniChip{
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px;
          background: #fff;
        }
        .miniLabel{
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(0,0,0,.55);
        }
        .miniValue{
          margin-top: 2px;
          font-weight: 900;
          font-size: 16px;
        }

        .gameNotes{
          margin-top: 10px;
          font-size: 12px;
          color: rgba(0,0,0,.65);
          border-top: 1px solid var(--line);
          padding-top: 10px;
        }

        /* Share modal */
        .modalOverlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.25);
          display:flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 50;
        }

        .modal{
          width: 100%;
          max-width: 420px;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 18px;
          box-shadow: 0 20px 50px rgba(0,0,0,.18);
          padding: 16px;
        }

        .modalTitle{
          font-weight: 900;
          font-size: 16px;
        }

        .modalHint{
          margin-top: 4px;
          color: var(--muted);
          font-size: 12px;
        }

        .modalButtons{
          margin-top: 14px;
          display:flex;
          flex-direction: column;
          gap: 10px;
        }

        .modalBtn{
          width: 100%;
          border: 0;
          border-radius: 14px;
          padding: 12px 14px;
          background: var(--ink);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }

        .modalBtn:disabled{
          opacity: .5;
          cursor: not-allowed;
        }

        .modalBtnSecondary{
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff;
          color: var(--ink);
          font-weight: 800;
          cursor: pointer;
        }

        .modalMicro{
          margin-top: 12px;
          font-size: 12px;
          color: rgba(0,0,0,.55);
        }
      `}</style>
    </div>
  );
}
