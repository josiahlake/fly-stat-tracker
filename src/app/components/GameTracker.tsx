"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Plan = "single_game" | "season" | "unlimited_monthly" | "unlimited_annual";
type EntitlementPlan = "free" | "season" | "unlimited_monthly" | "unlimited_annual";

type LiveCounts = {
  fg2m: number;
  fg2x: number;
  fg3m: number;
  fg3x: number;
  ftm: number;
  ftx: number;
  orb: number;
  drb: number;
  ast: number;
  tov: number;
  stl: number;
  foul: number;
};

type GameEntry = {
  id: string;
  createdAt: number;
  date: string;
  team: string;
  opponent: string;
  playerName: string;
  notes?: string;
  counts: LiveCounts;
};

type Entitlement = {
  plan: EntitlementPlan;
  singleCredits: number; // optional (single game add-ons)
  updatedAt: number;
};

const STORAGE_GAMES = "fly_games_v1";
const STORAGE_ENT = "fly_entitlement_v1";

const TRIAL_SAVES = 2; // saves #1 and #2 are free; attempting save #3 triggers paywall

const emptyCounts: LiveCounts = {
  fg2m: 0,
  fg2x: 0,
  fg3m: 0,
  fg3x: 0,
  ftm: 0,
  ftx: 0,
  orb: 0,
  drb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  foul: 0,
};

function makeId() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sumCounts(games: GameEntry[]) {
  return games.reduce(
    (acc, g) => {
      const c = g.counts;
      (Object.keys(acc) as (keyof LiveCounts)[]).forEach((k) => {
        acc[k] += c[k];
      });
      return acc;
    },
    { ...emptyCounts }
  );
}

function computePTS(c: LiveCounts) {
  return c.fg2m * 2 + c.fg3m * 3 + c.ftm;
}

function formatPct(m: number, a: number) {
  if (a <= 0) return "0.0%";
  return `${((m / a) * 100).toFixed(1)}%`;
}

export default function GameTracker() {
  // ---------------------------
  // State
  // ---------------------------
  const [games, setGames] = useState<GameEntry[]>([]);
  const [counts, setCounts] = useState<LiveCounts>({ ...emptyCounts });

  const [date, setDate] = useState<string>(todayISO());
  const [team, setTeam] = useState<string>("Fly Academy");
  const [opponent, setOpponent] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [ent, setEnt] = useState<Entitlement>({
    plan: "free",
    singleCredits: 0,
    updatedAt: Date.now(),
  });

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<Plan | null>(null);

  // Small tap feedback
  const tapTimeoutRef = useRef<number | null>(null);
  const [tapKey, setTapKey] = useState<string>("");

  // ---------------------------
  // Load persisted data
  // ---------------------------
  useEffect(() => {
    const savedGames = safeParse<GameEntry[]>(localStorage.getItem(STORAGE_GAMES), []);
    setGames(savedGames);

    const savedEnt = safeParse<Entitlement>(localStorage.getItem(STORAGE_ENT), {
      plan: "free",
      singleCredits: 0,
      updatedAt: Date.now(),
    });
    setEnt(savedEnt);
  }, []);

  // Persist games
  useEffect(() => {
    localStorage.setItem(STORAGE_GAMES, JSON.stringify(games));
  }, [games]);

  // Persist entitlement
  useEffect(() => {
    localStorage.setItem(STORAGE_ENT, JSON.stringify(ent));
  }, [ent]);

  // ---------------------------
  // Handle return params (optional)
  // If you appended ?success=1&plan=season, this will apply it.
  // ---------------------------
  useEffect(() => {
    const url = new URL(window.location.href);
    const success = url.searchParams.get("success");
    const plan = url.searchParams.get("plan") as Plan | null;

    if (success === "1" && plan) {
      applyPurchaseFromReturn(plan);

      // clean URL
      url.searchParams.delete("success");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // Derived data
  // ---------------------------
  const playerNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) set.add(g.playerName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  useEffect(() => {
    // default selected player
    if (!selectedPlayer) {
      if (playerNames.length > 0) setSelectedPlayer(playerNames[0]);
      else if (playerName.trim()) setSelectedPlayer(playerName.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerNames.join("|")]);

  const gamesForSelected = useMemo(() => {
    const p = selectedPlayer.trim();
    if (!p) return [];
    return games.filter((g) => g.playerName === p);
  }, [games, selectedPlayer]);

  const seasonTotals = useMemo(() => sumCounts(gamesForSelected), [gamesForSelected]);
  const savedForPlayer = gamesForSelected.length;

  // ---------------------------
  // Paywall logic (FIXED TYPES)
  // ---------------------------
  const isUnlimited = ent.plan === "unlimited_monthly" || ent.plan === "unlimited_annual";
  const isSeason = ent.plan === "season";
  const hasSingleCredit = ent.singleCredits > 0;

  const isPaid = isUnlimited || isSeason || hasSingleCredit;

  // ---------------------------
  // Helpers
  // ---------------------------
  function tapFeedback(key: string) {
    setTapKey(key);
    if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = window.setTimeout(() => setTapKey(""), 120);

    // optional haptic feedback on mobile
    try {
      // @ts-ignore
      if (navigator?.vibrate) navigator.vibrate(20);
    } catch {}
  }

  function inc(k: keyof LiveCounts, delta = 1) {
    setCounts((prev) => ({ ...prev, [k]: Math.max(0, prev[k] + delta) }));
  }

  function resetLive() {
    setCounts({ ...emptyCounts });
    setNotes("");
    setOpponent("");
    // keep date/team/playerName
  }

  function applyPurchaseFromReturn(plan: Plan) {
    setEnt((prev) => {
      if (plan === "single_game") {
        return {
          ...prev,
          // keep plan as-is; add a credit
          singleCredits: (prev.singleCredits || 0) + 1,
          updatedAt: Date.now(),
        };
      }
      if (plan === "season") {
        return { plan: "season", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      if (plan === "unlimited_monthly") {
        return { plan: "unlimited_monthly", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      if (plan === "unlimited_annual") {
        return { plan: "unlimited_annual", singleCredits: prev.singleCredits || 0, updatedAt: Date.now() };
      }
      return prev;
    });

    setShowUpgrade(false);
  }

  async function startCheckout(plan: Plan) {
    try {
      setCheckoutBusy(plan);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Checkout error:", text);
        alert("Checkout failed. Please try again.");
        return;
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        alert("Checkout failed (no url).");
        return;
      }

      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      alert("Checkout failed. Please try again.");
    } finally {
      setCheckoutBusy(null);
    }
  }

  function saveGame() {
    const p = playerName.trim();
    if (!p) {
      alert("Please enter Player Name.");
      return;
    }

    // ✅ PAYWALL ENFORCEMENT:
    // saves #1 and #2 are free; attempting save #3 triggers paywall (unless already paid)
    if (!isPaid && savedForPlayer >= TRIAL_SAVES) {
      setShowUpgrade(true);
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

    setGames((prev) => [entry, ...prev]);
    setSelectedPlayer(p);

    // If they used a single-game credit, consume it on save.
    if (!isUnlimited && !isSeason && ent.singleCredits > 0) {
      setEnt((prev) => ({
        ...prev,
        singleCredits: Math.max(0, (prev.singleCredits || 0) - 1),
        updatedAt: Date.now(),
      }));
    }

    resetLive();
  }

  function deleteGame(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  // ---------------------------
  // UI numbers
  // ---------------------------
  const fgMade = counts.fg2m + counts.fg3m;
  const fgAtt = counts.fg2m + counts.fg2x + counts.fg3m + counts.fg3x;
  const fg3Made = counts.fg3m;
  const fg3Att = counts.fg3m + counts.fg3x;
  const ftMade = counts.ftm;
  const ftAtt = counts.ftm + counts.ftx;

  const pts = computePTS(counts);

  const ttlReb = counts.orb + counts.drb;

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">PREPARE FOR TAKEOFF</div>
          <div className="title">FLY STAT TRACKER</div>
          <div className="subtitle">Track your player's stats for a game or for a season.</div>
        </div>

        {/* Top Save */}
        <div className="topActions">
          <button className="primaryBtn" onClick={saveGame} type="button">
            Save Game
          </button>
        </div>
      </div>

      {/* UPGRADE MODAL */}
      {showUpgrade && (
        <div className="modalOverlay">
          <div className="modal">
            <h2>Unlock Full Season Tracking</h2>
            <p>
              You’ve used your <b>{TRIAL_SAVES}</b> free game saves.
              <br />
              Upgrade to continue saving games and viewing season stats.
            </p>

            <button
              onClick={() => startCheckout("single_game")}
              disabled={checkoutBusy !== null}
              type="button"
            >
              {checkoutBusy === "single_game" ? "Starting…" : "Add This Game ($6.99)"}
            </button>

            <button
              onClick={() => startCheckout("season")}
              disabled={checkoutBusy !== null}
              type="button"
            >
              {checkoutBusy === "season" ? "Starting…" : "Season Pass ($19.99)"}
            </button>

            <button
              onClick={() => startCheckout("unlimited_monthly")}
              disabled={checkoutBusy !== null}
              type="button"
            >
              {checkoutBusy === "unlimited_monthly" ? "Starting…" : "Unlimited Monthly ($4.99/mo)"}
            </button>

            <button
              onClick={() => startCheckout("unlimited_annual")}
              disabled={checkoutBusy !== null}
              type="button"
            >
              {checkoutBusy === "unlimited_annual" ? "Starting…" : "Unlimited Annual ($49/yr)"}
            </button>

            <button onClick={() => setShowUpgrade(false)} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid">
        {/* LEFT: live entry */}
        <div className="card">
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
                placeholder="e.g., Jemai Lake"
              />
            </div>

            <div className="field">
              <div className="label">OPPONENT</div>
              <input
                className="input"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="e.g., Lake Oswego"
              />
            </div>
          </div>

          {/* Tiles layout stays “two rows” conceptually; your CSS controls exact look */}
          <div className="sectionLabel">SCORING</div>
          <div className="tileGrid">
            <button
              className={`tile ${tapKey === "fg2m" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("fg2m");
                inc("fg2m", 1);
              }}
              type="button"
            >
              <div className="tileBig">+2</div>
              <div className="tileSmall">Made 2PT</div>
            </button>

            <button
              className={`tile miss ${tapKey === "fg2x" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("fg2x");
                inc("fg2x", 1);
              }}
              type="button"
            >
              <div className="tileBig">2 Miss</div>
              <div className="tileSmall">Missed 2PT</div>
            </button>

            <button
              className={`tile ${tapKey === "fg3m" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("fg3m");
                inc("fg3m", 1);
              }}
              type="button"
            >
              <div className="tileBig">+3</div>
              <div className="tileSmall">Made 3PT</div>
            </button>

            <button
              className={`tile miss ${tapKey === "fg3x" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("fg3x");
                inc("fg3x", 1);
              }}
              type="button"
            >
              <div className="tileBig">3 Miss</div>
              <div className="tileSmall">Missed 3PT</div>
            </button>

            <button
              className={`tile ${tapKey === "ftm" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("ftm");
                inc("ftm", 1);
              }}
              type="button"
            >
              <div className="tileBig">+FT</div>
              <div className="tileSmall">Made FT</div>
            </button>

            <button
              className={`tile miss ${tapKey === "ftx" ? "tap" : ""}`}
              onClick={() => {
                tapFeedback("ftx");
                inc("ftx", 1);
              }}
              type="button"
            >
              <div className="tileBig">FT Miss</div>
              <div className="tileSmall">Missed FT</div>
            </button>
          </div>

          <div className="sectionLabel">HUSTLE + OTHER</div>
          <div className="tileGrid">
            <button className={`tile ${tapKey === "orb" ? "tap" : ""}`} onClick={() => { tapFeedback("orb"); inc("orb", 1); }} type="button">
              <div className="tileBig">ORB</div>
              <div className="tileSmall">Off. Rebound</div>
            </button>

            <button className={`tile ${tapKey === "drb" ? "tap" : ""}`} onClick={() => { tapFeedback("drb"); inc("drb", 1); }} type="button">
              <div className="tileBig">DRB</div>
              <div className="tileSmall">Def. Rebound</div>
            </button>

            <button className={`tile ${tapKey === "ast" ? "tap" : ""}`} onClick={() => { tapFeedback("ast"); inc("ast", 1); }} type="button">
              <div className="tileBig">AST</div>
              <div className="tileSmall">Assist</div>
            </button>

            <button className={`tile ${tapKey === "tov" ? "tap" : ""}`} onClick={() => { tapFeedback("tov"); inc("tov", 1); }} type="button">
              <div className="tileBig">TO</div>
              <div className="tileSmall">Turnover</div>
            </button>

            <button className={`tile ${tapKey === "stl" ? "tap" : ""}`} onClick={() => { tapFeedback("stl"); inc("stl", 1); }} type="button">
              <div className="tileBig">STL</div>
              <div className="tileSmall">Steal</div>
            </button>

            <button className={`tile ${tapKey === "foul" ? "tap" : ""}`} onClick={() => { tapFeedback("foul"); inc("foul", 1); }} type="button">
              <div className="tileBig">FOUL</div>
              <div className="tileSmall">Personal</div>
            </button>
          </div>

          <div className="sectionLabel">NOTES</div>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
          />

          {/* Bottom Save */}
          <div className="saveRow">
            <button className="primaryBtn" onClick={saveGame} type="button">
              Save Game
            </button>
          </div>

          <div className="microHint">Tip: Use Save to lock in games for season stats.</div>
        </div>

        {/* RIGHT: season + log */}
        <div className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Season Stats</div>
              <div className="cardHint">
                {selectedPlayer ? `${selectedPlayer}` : "Select a player"} • {gamesForSelected.length} games
              </div>
            </div>
            <div className="pill">
              {ent.plan === "free" ? `Free (${savedForPlayer}/${TRIAL_SAVES})` : `Unlocked: ${ent.plan.replace("_", " ")}`}
            </div>
          </div>

          <div className="field" style={{ marginTop: 6 }}>
            <div className="label">SELECT PLAYER</div>
            <select
              className="select"
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
            >
              {playerNames.length === 0 ? (
                <option value="">No players yet</option>
              ) : (
                playerNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Season totals */}
<div className="statsGrid">
  {/* Row 1 (shooting) */}
  <div className="statBox">
    <div className="statLabel">PTS</div>
    <div className="statValue">{computePTS(seasonTotals)}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">FG</div>
    <div className="statValue">
      {seasonTotals.fg2m + seasonTotals.fg3m}-
      {seasonTotals.fg2m + seasonTotals.fg2x + seasonTotals.fg3m + seasonTotals.fg3x}
    </div>
  </div>

  <div className="statBox">
    <div className="statLabel">FG%</div>
    <div className="statValue">
      {formatPct(
        seasonTotals.fg2m + seasonTotals.fg3m,
        seasonTotals.fg2m + seasonTotals.fg2x + seasonTotals.fg3m + seasonTotals.fg3x
      )}
    </div>
  </div>

  <div className="statBox">
    <div className="statLabel">3P</div>
    <div className="statValue">
      {seasonTotals.fg3m}-{seasonTotals.fg3m + seasonTotals.fg3x}
    </div>
  </div>

  <div className="statBox">
    <div className="statLabel">3P%</div>
    <div className="statValue">
      {formatPct(seasonTotals.fg3m, seasonTotals.fg3m + seasonTotals.fg3x)}
    </div>
  </div>

  <div className="statBox">
    <div className="statLabel">FT</div>
    <div className="statValue">
      {seasonTotals.ftm}-{seasonTotals.ftm + seasonTotals.ftx}
    </div>
  </div>

  <div className="statBox">
    <div className="statLabel">FT%</div>
    <div className="statValue">
      {formatPct(seasonTotals.ftm, seasonTotals.ftm + seasonTotals.ftx)}
    </div>
  </div>

  {/* Row 2 (hustle) */}
  <div className="statBox">
    <div className="statLabel">O REBS</div>
    <div className="statValue">{seasonTotals.orb}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">D REBS</div>
    <div className="statValue">{seasonTotals.drb}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">TTL REBS</div>
    <div className="statValue">{seasonTotals.orb + seasonTotals.drb}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">AST</div>
    <div className="statValue">{seasonTotals.ast}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">TO</div>
    <div className="statValue">{seasonTotals.tov}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">STLS</div>
    <div className="statValue">{seasonTotals.stl}</div>
  </div>

  <div className="statBox">
    <div className="statLabel">FOULS</div>
    <div className="statValue">{seasonTotals.foul}</div>
  </div>
</div>

          <div className="sectionLabel" style={{ marginTop: 12 }}>
            Games
          </div>

          <div className="gamesList">
            {gamesForSelected.map((g) => {
              const c = g.counts;
              const gPts = computePTS(c);
              const gFgMade = c.fg2m + c.fg3m;
              const gFgAtt = c.fg2m + c.fg2x + c.fg3m + c.fg3x;
              const g3Made = c.fg3m;
              const g3Att = c.fg3m + c.fg3x;
              const gFtMade = c.ftm;
              const gFtAtt = c.ftm + c.ftx;
              const gReb = c.orb + c.drb;

              return (
                <div key={g.id} className="gameCard">
                  <div className="gameTop">
                    <div className="gameTitle">
                      {g.playerName} • {g.date}
                    </div>
                    <button className="ghostBtn" onClick={() => deleteGame(g.id)} type="button">
                      Delete
                    </button>
                  </div>

                  <div className="gameLine">
                    {g.opponent ? `vs ${g.opponent} • ` : ""}
                    PTS {gPts} • FG {gFgMade}-{gFgAtt} • 3P {g3Made}-{g3Att} • FT {gFtMade}-{gFtAtt}
                  </div>

                  <div className="miniGrid">
                    <div className="miniBox">
                      <div className="miniLabel">REB</div>
                      <div className="miniValue">{gReb}</div>
                    </div>
                    <div className="miniBox">
                      <div className="miniLabel">AST</div>
                      <div className="miniValue">{c.ast}</div>
                    </div>
                    <div className="miniBox">
                      <div className="miniLabel">STL</div>
                      <div className="miniValue">{c.stl}</div>
                    </div>
                    <div className="miniBox">
                      <div className="miniLabel">FOUL</div>
                      <div className="miniValue">{c.foul}</div>
                    </div>
                  </div>

                  {g.notes ? <div className="gameNotes">{g.notes}</div> : null}
                </div>
              );
            })}
          </div>

          <div className="microHint" style={{ marginTop: 8 }}>
            Saved games are stored locally on this device.
          </div>
        </div>
      </div>
    </div>
  );
}
