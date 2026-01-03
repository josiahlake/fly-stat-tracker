"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Counts = {
  pts: number;

  fgMade: number;
  fgAtt: number;

  threeMade: number;
  threeAtt: number;

  ftMade: number;
  ftAtt: number;

  oreb: number;
  dreb: number;

  ast: number;
  to: number;
  stl: number;
  fouls: number;
};

type GameEntry = {
  id: string;
  createdAt: number;
  date: string; // YYYY-MM-DD
  team: string;
  opponent: string;
  playerName: string;
  notes?: string;

  counts: Counts;
};

type Action =
  | { kind: "inc"; key: keyof Counts; by: number }
  | { kind: "dec"; key: keyof Counts; by: number }
  | { kind: "reset"; prevCounts: Counts };

const STORAGE_KEY = "fly_stat_tracker_games_v1";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeId(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function emptyCounts(): Counts {
  return {
    pts: 0,
    fgMade: 0,
    fgAtt: 0,
    threeMade: 0,
    threeAtt: 0,
    ftMade: 0,
    ftAtt: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    to: 0,
    stl: 0,
    fouls: 0,
  };
}

function clampNonNeg(n: number): number {
  return Math.max(0, n);
}

function safePct(made: number, att: number): number {
  if (!att) return 0;
  return (made / att) * 100;
}

function formatPct(n: number): string {
  // one decimal like 33.3%
  return `${n.toFixed(1)}%`;
}

function describeAction(a: Action): string {
  if (a.kind === "reset") return "RESET";
  const dir = a.kind === "inc" ? "+" : "-";
  return `${dir}${a.by} ${String(a.key).toUpperCase()}`;
}

function loadGames(): GameEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveGames(games: GameEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export default function GameTracker() {
  // Live game meta
  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");

  // Live counts
  const [counts, setCounts] = useState<Counts>(() => emptyCounts());

  // Undo history
  const [history, setHistory] = useState<Action[]>([]);

  // Vib toggle
  const [vibOn, setVibOn] = useState<boolean>(true);

  // Saved games + player log
  const [games, setGamesState] = useState<GameEntry[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");

  // guard to prevent double-tap race on very fast clicks
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    const g = loadGames();
    setGamesState(g);
  }, []);

  // derived: players list
  const players = useMemo(() => {
    const s = new Set<string>();
    for (const g of games) s.add(g.playerName);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [games]);

  // derived: current player's games
  const selectedGames = useMemo(() => {
    if (!selectedPlayer) return [];
    return games.filter((g) => g.playerName === selectedPlayer);
  }, [games, selectedPlayer]);

  // derived: season to date
  const seasonTotals = useMemo(() => {
    const t = emptyCounts();
    for (const g of selectedGames) {
      const c = g.counts;
      (Object.keys(t) as (keyof Counts)[]).forEach((k) => {
        t[k] += c[k];
      });
    }
    return t;
  }, [selectedGames]);

  const seasonAverages = useMemo(() => {
    const n = selectedGames.length || 0;
    const totals = seasonTotals;

    const ppg = n ? totals.pts / n : 0;
    const rpg = n ? (totals.oreb + totals.dreb) / n : 0;
    const apg = n ? totals.ast / n : 0;

    const fgPct = safePct(totals.fgMade, totals.fgAtt);
    const threePct = safePct(totals.threeMade, totals.threeAtt);
    const ftPct = safePct(totals.ftMade, totals.ftAtt);

    const orbG = n ? totals.oreb / n : 0;
    const drbG = n ? totals.dreb / n : 0;

    return { n, ppg, rpg, apg, fgPct, threePct, ftPct, orbG, drbG };
  }, [seasonTotals, selectedGames.length]);

  function maybeVibrate() {
    if (!vibOn) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      // very short pulse
      (navigator as any).vibrate?.(15);
    }
  }

  function applyDelta(key: keyof Counts, by: number) {
    setCounts((prev) => {
      const next = { ...prev };
      next[key] = clampNonNeg(next[key] + by);
      return next;
    });
  }

  function tap(action: Action) {
    // tiny debounce to avoid accidental double taps on trackpads
    const now = Date.now();
    if (now - lastTapRef.current < 35) return;
    lastTapRef.current = now;

    setHistory((h) => [...h, action]);

    if (action.kind === "reset") {
      setCounts({ ...action.prevCounts }); // will be overwritten by resetLive(), but keep consistent if used
      return;
    }

    const { key, by } = action;
    if (action.kind === "inc") applyDelta(key, by);
    if (action.kind === "dec") applyDelta(key, -by);

    maybeVibrate();
  }

  function inc(key: keyof Counts, by = 1) {
    tap({ kind: "inc", key, by });
  }

  // For undoing "inc", we apply a "dec" of same magnitude.
  function undoOne(action: Action) {
    if (action.kind === "reset") {
      // restore previous counts snapshot
      setCounts({ ...action.prevCounts });
      return;
    }
    if (action.kind === "inc") {
      applyDelta(action.key, -action.by);
      return;
    }
    if (action.kind === "dec") {
      applyDelta(action.key, action.by);
      return;
    }
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      // apply inverse in state updates
      undoOne(last);
      return h.slice(0, -1);
    });
  }

  function resetLive() {
    setCounts(emptyCounts());
    setHistory([]);
  }

  // ✅ Confirm wrappers (Step 1)
  function confirmUndo() {
    if (!history.length) return;

    const last = history[history.length - 1];
    const msg =
      `Undo last action: ${describeAction(last)}?\n\n` +
      `This will revert your most recent tap.`;

    const ok = window.confirm(msg);
    if (ok) undo();
  }

  function confirmReset() {
    const player = (playerName || "").trim() || "this player";
    const hasStats =
      Object.values(counts).some((v) => v > 0) || history.length > 0;

    if (!hasStats) return;

    const msg =
      `Are you sure you want to clear ${player}'s LIVE stats?\n\n` +
      `This does not delete saved games.\n\n` +
      `Press OK to clear, or Cancel to keep stats.`;

    const ok = window.confirm(msg);
    if (ok) resetLive();
  }

  // Derived live box numbers
  const ttlReb = counts.oreb + counts.dreb;
  const fgPct = safePct(counts.fgMade, counts.fgAtt);
  const threePct = safePct(counts.threeMade, counts.threeAtt);
  const ftPct = safePct(counts.ftMade, counts.ftAtt);

  function saveGame() {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

    const entry: GameEntry = {
      id: makeId(),
      createdAt: Date.now(),
      date,
      team: team.trim() || "Fly Academy",
      opponent: opponent.trim(),
      playerName: p,
      counts: { ...counts },
    };

    const next = [entry, ...games];
    setGamesState(next);
    saveGames(next);

    // update player dropdown automatically
    setSelectedPlayer(p);

    // clear live stats for next player/game
    resetLive();
  }

  function deleteGame(id: string) {
    const next = games.filter((g) => g.id !== id);
    setGamesState(next);
    saveGames(next);
  }

  return (
    <div className="page">
      <div className="topBar">
        <div>
          <div className="kicker">PREPARE FOR TAKEOFF</div>
          <h1 className="title">Fly Stat Tracker</h1>
          <div className="subtitle">
            Tap to track live. Save when the game ends. One player at a time.
          </div>
        </div>

        <div className="topActions">
          <button
            className="ghostBtn"
            onClick={() => setVibOn((v) => !v)}
            type="button"
          >
            Vib: {vibOn ? "On" : "Off"}
          </button>

          <button
            className="ghostBtn"
            onClick={confirmUndo}
            type="button"
            disabled={!history.length}
          >
            Undo
          </button>

          <button
            className="ghostBtn"
            onClick={confirmReset}
            type="button"
            disabled={!(Object.values(counts).some((v) => v > 0) || history.length > 0)}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Live Game Tracker</div>
              <div className="cardHint">Big buttons • fast taps • phone-friendly</div>
            </div>

            <button className="primaryBtn" onClick={saveGame} type="button">
              Save
            </button>
          </div>

          <div className="formGrid">
            <div className="field">
              <div className="label">DATE</div>
              <input
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                type="date"
              />
            </div>

            <div className="field">
              <div className="label">TEAM</div>
              <input
                className="input"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="Fly Academy"
              />
            </div>

            <div className="field">
              <div className="label">
                PLAYER NAME <span style={{ color: "#d33" }}>*</span>
              </div>
              <input
                className="input"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g., Jordan"
              />
            </div>

            <div className="field">
              <div className="label">OPPONENT</div>
              <input
                className="input"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="e.g., Tigard"
              />
            </div>
          </div>

          {/* Tiles */}
          <div className="tiles">
            {/* Row 1 (shooting): PTS | FG | FG% | 3P FG | 3P FG% | FT | FT% */}
            <div className="tile">
              <div className="tileLabel">PTS</div>
              <div className="tileValue">{counts.pts}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">FG</div>
              <div className="tileValue">
                {counts.fgMade}-{counts.fgAtt}
              </div>
            </div>
            <div className="tile">
              <div className="tileLabel">FG%</div>
              <div className="tileValue">{formatPct(fgPct)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">3P FG</div>
              <div className="tileValue">
                {counts.threeMade}-{counts.threeAtt}
              </div>
            </div>
            <div className="tile">
              <div className="tileLabel">3P FG%</div>
              <div className="tileValue">{formatPct(threePct)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">FT</div>
              <div className="tileValue">
                {counts.ftMade}-{counts.ftAtt}
              </div>
            </div>
            <div className="tile">
              <div className="tileLabel">FT%</div>
              <div className="tileValue">{formatPct(ftPct)}</div>
            </div>

            {/* Row 2 (hustle): O REBS | D REBS | TTL REBS | AST | TO | STLS | FOULS */}
            <div className="tile">
              <div className="tileLabel">O REBS</div>
              <div className="tileValue">{counts.oreb}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">D REBS</div>
              <div className="tileValue">{counts.dreb}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">TTL REBS</div>
              <div className="tileValue">{ttlReb}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">AST</div>
              <div className="tileValue">{counts.ast}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">TO</div>
              <div className="tileValue">{counts.to}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">STLS</div>
              <div className="tileValue">{counts.stl}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">FOULS</div>
              <div className="tileValue">{counts.fouls}</div>
            </div>
          </div>

          {/* Buttons */}
          <div className="sectionTitle">SCORING</div>
          <div className="bigBtnGrid">
            <button
              className="bigBtn bigBtnMake"
              type="button"
              onClick={() => {
                inc("pts", 2);
                inc("fgMade", 1);
                inc("fgAtt", 1);
              }}
            >
              <div className="bigBtnTop">+2</div>
              <div className="bigBtnSub">Made 2PT</div>
            </button>

            <button
              className="bigBtn bigBtnMiss"
              type="button"
              onClick={() => inc("fgAtt", 1)}
            >
              <div className="bigBtnTop">2 Miss</div>
              <div className="bigBtnSub">Missed 2PT</div>
            </button>

            <button
              className="bigBtn bigBtnMake"
              type="button"
              onClick={() => {
                inc("pts", 3);
                inc("threeMade", 1);
                inc("threeAtt", 1);
                inc("fgMade", 1);
                inc("fgAtt", 1);
              }}
            >
              <div className="bigBtnTop">+3</div>
              <div className="bigBtnSub">Made 3PT</div>
            </button>

            <button
              className="bigBtn bigBtnMiss"
              type="button"
              onClick={() => {
                inc("threeAtt", 1);
                inc("fgAtt", 1);
              }}
            >
              <div className="bigBtnTop">3 Miss</div>
              <div className="bigBtnSub">Missed 3PT</div>
            </button>

            <button
              className="bigBtn bigBtnMake"
              type="button"
              onClick={() => {
                inc("pts", 1);
                inc("ftMade", 1);
                inc("ftAtt", 1);
              }}
            >
              <div className="bigBtnTop">+FT</div>
              <div className="bigBtnSub">Made FT</div>
            </button>

            <button
              className="bigBtn bigBtnMiss"
              type="button"
              onClick={() => inc("ftAtt", 1)}
            >
              <div className="bigBtnTop">FT Miss</div>
              <div className="bigBtnSub">Missed FT</div>
            </button>
          </div>

          <div className="sectionTitle">HUSTLE + OTHER</div>
          <div className="bigBtnGrid">
            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("oreb", 1)}
            >
              <div className="bigBtnTop">OREB</div>
              <div className="bigBtnSub">Offensive Rebound</div>
            </button>

            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("dreb", 1)}
            >
              <div className="bigBtnTop">DREB</div>
              <div className="bigBtnSub">Defensive Rebound</div>
            </button>

            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("ast", 1)}
            >
              <div className="bigBtnTop">AST</div>
              <div className="bigBtnSub">Assist</div>
            </button>

            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("to", 1)}
            >
              <div className="bigBtnTop">TO</div>
              <div className="bigBtnSub">Turnover</div>
            </button>

            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("stl", 1)}
            >
              <div className="bigBtnTop">STLS</div>
              <div className="bigBtnSub">Steal</div>
            </button>

            <button
              className="bigBtn bigBtnNeutral"
              type="button"
              onClick={() => inc("fouls", 1)}
            >
              <div className="bigBtnTop">FOULS</div>
              <div className="bigBtnSub">Personal Foul</div>
            </button>
          </div>

          <div className="tinyHint">
            Tip: Undo will revert your last tap. Reset clears only the live stats for the current player.
          </div>
        </div>

        {/* RIGHT */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Player Log</div>
              <div className="cardHint">{selectedGames.length} games</div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <div className="label">SELECT PLAYER</div>
            <select
              className="input"
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
            >
              <option value="">{players.length ? "Select..." : "No players yet"}</option>
              {players.map((p) => (
                <option value={p} key={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="sectionTitle" style={{ marginTop: 14 }}>
            Season-to-date
          </div>

          <div className="tiles">
            <div className="tile">
              <div className="tileLabel">PPG</div>
              <div className="tileValue">{seasonAverages.ppg.toFixed(1)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">RPG</div>
              <div className="tileValue">{seasonAverages.rpg.toFixed(1)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">APG</div>
              <div className="tileValue">{seasonAverages.apg.toFixed(1)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">FG%</div>
              <div className="tileValue">{formatPct(seasonAverages.fgPct)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">3P%</div>
              <div className="tileValue">{formatPct(seasonAverages.threePct)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">FT%</div>
              <div className="tileValue">{formatPct(seasonAverages.ftPct)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">ORB/G</div>
              <div className="tileValue">{seasonAverages.orbG.toFixed(1)}</div>
            </div>
            <div className="tile">
              <div className="tileLabel">DRB/G</div>
              <div className="tileValue">{seasonAverages.drbG.toFixed(1)}</div>
            </div>
          </div>

          <div className="tinyHint">
            Tip: Save each game. This panel updates averages automatically.
          </div>

          <div className="sectionTitle" style={{ marginTop: 14 }}>
            Games
          </div>

          <div className="gamesList">
            {!selectedPlayer ? (
              <div className="emptyState">
                Select a player to view saved games.
              </div>
            ) : selectedGames.length === 0 ? (
              <div className="emptyState">No games saved for this player yet.</div>
            ) : (
              selectedGames.map((g) => {
                const c = g.counts;
                const gTtlReb = c.oreb + c.dreb;
                const gFgPct = safePct(c.fgMade, c.fgAtt);
                const g3Pct = safePct(c.threeMade, c.threeAtt);
                const gFtPct = safePct(c.ftMade, c.ftAtt);

                return (
                  <div className="gameRow" key={g.id}>
                    <div className="gameRowTop">
                      <div className="gameRowTitle">
                        {g.date} • {g.opponent ? `vs ${g.opponent}` : g.team}
                      </div>
                      <button
                        className="linkBtn"
                        type="button"
                        onClick={() => {
                          const ok = window.confirm("Delete this saved game?");
                          if (ok) deleteGame(g.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="gameRowStats">
                      <div>
                        <span className="muted">PTS</span> {c.pts}
                      </div>
                      <div>
                        <span className="muted">REB</span> {gTtlReb}
                      </div>
                      <div>
                        <span className="muted">AST</span> {c.ast}
                      </div>
                      <div>
                        <span className="muted">FG</span> {c.fgMade}-{c.fgAtt} ({formatPct(gFgPct)})
                      </div>
                      <div>
                        <span className="muted">3P</span> {c.threeMade}-{c.threeAtt} ({formatPct(g3Pct)})
                      </div>
                      <div>
                        <span className="muted">FT</span> {c.ftMade}-{c.ftAtt} ({formatPct(gFtPct)})
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="tinyHint" style={{ marginTop: 10 }}>
            Saved games are stored locally on this device for now. Next upgrade: export/share + cloud sync across devices.
          </div>
        </div>
      </div>
    </div>
  );
}
