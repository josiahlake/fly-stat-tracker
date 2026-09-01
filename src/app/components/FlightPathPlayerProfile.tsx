"use client";

import { useEffect, useState } from "react";
import FlightLevelMark from "./FlightLevelMark";
import { supabase } from "../lib/supabase";

type Props = {
  playerId: string;
  onHome: () => void;
  onOpenLog: () => void;
  onTrackGame: () => void;
  onOpenPath: () => void;
};

type ProfileData = {
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  teamName: string | null;
  seasonName: string | null;
  level: "elevate" | "ascend" | "air" | "select";
};

function extractLevel(teamName: string | null): ProfileData["level"] {
  const match = teamName?.match(/\[([^\]]+)\]/)?.[1]?.toLowerCase() ?? "";
  if (match.includes("elevate")) return "elevate";
  if (match.includes("air")) return "air";
  if (match.includes("select")) return "select";
  return "ascend";
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function NavIcon({ type }: { type: "home" | "log" | "path" | "player" }) {
  if (type === "home") {
    return <svg viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2V21h-6v-6H9v6H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
  }
  if (type === "log") {
    return <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M9 3h6v4H9zM9 11h6M9 15h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  }
  if (type === "path") {
    return <svg viewBox="0 0 24 24"><path d="m3 12 18-8-7 17-3-7-8-2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
  }
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 21c.6-4.3 3-6.5 7.5-6.5s6.9 2.2 7.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

export default function FlightPathPlayerProfile({
  playerId,
  onHome,
  onOpenLog,
  onTrackGame,
  onOpenPath,
}: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function loadPhoto() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const path = `${user.id}/${playerId}/profile.jpg`;
    const { data, error } = await supabase.storage
      .from("flight-player-photos")
      .createSignedUrl(path, 60 * 60);

    if (!error && data?.signedUrl) {
      setPhotoUrl(`${data.signedUrl}&v=${Date.now()}`);
    } else {
      setPhotoUrl(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const { data: player, error: playerError } = await supabase
          .from("flight_players")
          .select("first_name,last_name")
          .eq("id", playerId)
          .single();

        if (playerError) throw playerError;

        const { data: membership, error: membershipError } = await supabase
          .from("flight_team_memberships")
          .select(`
            jersey_number,
            teams (display_name),
            seasons (name)
          `)
          .eq("player_id", playerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;

        if (cancelled) return;

        const teamName =
          (membership?.teams as { display_name?: string } | null)?.display_name ??
          null;

        setProfile({
          firstName: player.first_name,
          lastName: player.last_name,
          jerseyNumber: membership?.jersey_number ?? null,
          teamName,
          seasonName:
            (membership?.seasons as { name?: string } | null)?.name ?? null,
          level: extractLevel(teamName),
        });

        await loadPhoto();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load player profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  async function handlePhoto(file: File | null) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert("Please choose a photo smaller than 8 MB.");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      const path = `${user.id}/${playerId}/profile.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("flight-player-photos")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      await loadPhoto();
    } catch (err) {
      console.error("Player photo upload failed:", err);
      alert(err instanceof Error ? err.message : "We couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <main className="statePage">LOADING PLAYER PROFILE...<style>{styles}</style></main>;
  }

  if (error || !profile) {
    return (
      <main className="statePage">
        <strong>WE COULDN&apos;T LOAD THIS PLAYER.</strong>
        <span>{error}</span>
        <button type="button" onClick={onHome}>RETURN HOME</button>
        <style>{styles}</style>
      </main>
    );
  }

  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const teamDisplay =
    profile.teamName?.replace(/\s*\[[^\]]+\]\s*/, "") || "FLY ACADEMY";

  return (
    <main className="profilePage">
      <section className="phoneShell">
        <header className="header">
          <button type="button" className="back" onClick={onHome}>‹</button>
          <div className="headerBrand">
            <span>THE FLY ACADEMY</span>
            <strong>PLAYER</strong>
          </div>
          <div className="spacer" />
        </header>

        <section className="hero">
          <div className="avatarWrap">
            <div className="avatar">
              {photoUrl ? (
                <img src={photoUrl} alt={`${name} profile`} />
              ) : (
                <span>{initials(profile.firstName, profile.lastName)}</span>
              )}
            </div>

            <label className="photoButton">
              {uploading ? "UPLOADING..." : photoUrl ? "CHANGE PHOTO" : "ADD PHOTO"}
              <input
                type="file"
                accept="image/*"
                capture="user"
                disabled={uploading}
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="identity">
            <div className="eyebrow">PLAYER PROFILE</div>
            <h1>{name}</h1>

            <div className="meta">
              {profile.jerseyNumber ? <span>#{profile.jerseyNumber}</span> : null}
              <span>{teamDisplay}</span>
            </div>

            <div className="levelMark">
              <FlightLevelMark level={profile.level} showName size="md" />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardTitle">CURRENT FLIGHT</div>

          <div className="infoGrid">
            <div>
              <span>SEASON</span>
              <strong>{profile.seasonName || "CURRENT SEASON"}</strong>
            </div>
            <div>
              <span>TEAM</span>
              <strong>{teamDisplay}</strong>
            </div>
            <div>
              <span>JERSEY</span>
              <strong>{profile.jerseyNumber ? `#${profile.jerseyNumber}` : "—"}</strong>
            </div>
            <div>
              <span>LEVEL</span>
              <strong>[{profile.level.toUpperCase()}]</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="cardTitle">PLAYER SETTINGS</div>

          <button
            type="button"
            className="settingRow"
            onClick={() => alert("Editing player details is the next profile upgrade.")}
          >
            <div>
              <strong>EDIT PLAYER DETAILS</strong>
              <span>Name, jersey number and profile information</span>
            </div>
            <b>›</b>
          </button>

          <button
            type="button"
            className="settingRow"
            onClick={() => alert("Family sharing controls are coming next.")}
          >
            <div>
              <strong>SHARING & PRIVACY</strong>
              <span>Control what gets shared from Flight Path</span>
            </div>
            <b>›</b>
          </button>
        </section>

        <section className="card accountCard">
          <div className="cardTitle">ACCOUNT</div>
          <button
            type="button"
            className="signOut"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            SIGN OUT
          </button>
        </section>

        <nav className="bottomNav">
          <button type="button" className="navItem" onClick={onHome}>
            <span className="navIcon"><NavIcon type="home" /></span><small>HOME</small>
          </button>
          <button type="button" className="navItem" onClick={onOpenLog}>
            <span className="navIcon"><NavIcon type="log" /></span><small>LOG</small>
          </button>
          <button type="button" className="trackNav" onClick={onTrackGame}>
            <span>＋</span><small>TRACK</small>
          </button>
          <button type="button" className="navItem" onClick={onOpenPath}>
            <span className="navIcon"><NavIcon type="path" /></span><small>PATH</small>
          </button>
          <button type="button" className="navItem active">
            <span className="navIcon"><NavIcon type="player" /></span><small>PLAYER</small>
          </button>
        </nav>
      </section>

      <style>{styles}</style>
    </main>
  );
}

const styles = `
  *{box-sizing:border-box}html,body{margin:0;background:#000}button,input{font:inherit}
  .statePage{min-height:100vh;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:Arial,Helvetica,sans-serif}.statePage span{color:#888;font-size:12px}.statePage button{min-height:46px;padding:0 18px;border:1px solid #8f36df;border-radius:8px;background:#401261;color:#fff;font-weight:900}
  .profilePage{min-height:100vh;background:radial-gradient(circle at 50% -10%,#181818 0%,#070707 30%,#000 62%);color:#fff;padding:max(18px,env(safe-area-inset-top)) 14px calc(104px + env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}
  .phoneShell{width:100%;max-width:430px;margin:0 auto}.header{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;padding:5px 0 22px}.back{width:42px;height:42px;border:0;background:transparent;color:#fff;font-size:38px;text-align:left}.spacer{width:42px}.headerBrand{text-align:center;display:flex;flex-direction:column;gap:5px}.headerBrand span{color:#929298;font-size:9px;font-weight:900;letter-spacing:.22em}.headerBrand strong{font-size:25px;font-style:italic;letter-spacing:-.04em}
  .hero{display:grid;grid-template-columns:128px 1fr;gap:19px;align-items:center;padding:10px 0 23px}.avatarWrap{display:flex;flex-direction:column;align-items:center;gap:10px}.avatar{width:116px;height:116px;border-radius:50%;padding:2px;background:linear-gradient(145deg,#a34eea,#582082,#e5a719)}.avatar>span,.avatar img{width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#27272c,#0b0b0d 70%);font-size:34px;font-weight:950;object-fit:cover}.photoButton{font-size:9px;font-weight:950;letter-spacing:.08em;color:#c391ff;cursor:pointer}.photoButton input{display:none}.identity{min-width:0}.eyebrow{color:#8e8e94;font-size:9px;font-weight:900;letter-spacing:.14em}.identity h1{font-size:28px;line-height:1.02;margin:7px 0 8px;text-transform:uppercase;letter-spacing:-.04em}.meta{display:flex;flex-wrap:wrap;gap:8px;color:#b2b2b7;font-size:12px;font-weight:800}.levelMark{margin-top:12px}
  .card{border:1px solid #303035;border-radius:14px;background:linear-gradient(180deg,#0d0d0f,#070708);padding:15px;margin-bottom:13px}.cardTitle{font-size:10px;font-weight:950;letter-spacing:.12em;margin-bottom:13px}.infoGrid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #28282d;border-radius:11px;overflow:hidden}.infoGrid>div{padding:13px;border-right:1px solid #28282d;border-bottom:1px solid #28282d}.infoGrid>div:nth-child(2n){border-right:0}.infoGrid>div:nth-last-child(-n+2){border-bottom:0}.infoGrid span{display:block;color:#77777d;font-size:8px;font-weight:900;letter-spacing:.1em}.infoGrid strong{display:block;margin-top:6px;font-size:13px}
  .settingRow{width:100%;min-height:65px;display:flex;align-items:center;justify-content:space-between;gap:15px;border:0;border-top:1px solid #29292e;background:transparent;color:#fff;text-align:left;padding:12px 2px;cursor:pointer}.settingRow:first-of-type{border-top:0}.settingRow>div{display:flex;flex-direction:column;gap:5px}.settingRow strong{font-size:11px;letter-spacing:.05em}.settingRow span{color:#7f7f85;font-size:10px;line-height:1.35}.settingRow b{font-size:28px;font-weight:200;color:#aaa}.accountCard{margin-bottom:18px}.signOut{width:100%;min-height:48px;border:1px solid #5e2227;border-radius:9px;background:rgba(160,20,30,.08);color:#ff656c;font-size:11px;font-weight:950;letter-spacing:.08em}
  .bottomNav{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,430px);height:78px;padding:7px 8px calc(7px + env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1fr 1.18fr 1fr 1fr;align-items:end;background:rgba(5,5,6,.97);backdrop-filter:blur(15px);border-top:1px solid #2d2d32;z-index:30}.navItem,.trackNav{border:0;background:transparent;color:#8a8a90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}.navItem.active{color:#a84df5}.navIcon{width:24px;height:24px;display:block}.navIcon svg{width:100%;height:100%}.navItem small,.trackNav small{font-size:8px;font-weight:950;letter-spacing:.05em}.trackNav{align-self:center;color:#d2d2d5}.trackNav>span{width:47px;height:47px;display:flex;align-items:center;justify-content:center;border:1px solid #9848d4;border-radius:50%;background:linear-gradient(135deg,#7c2db7,#4e176d);color:#fff;font-size:29px;line-height:1;box-shadow:0 0 19px rgba(121,43,182,.30)}
  @media(max-width:380px){.profilePage{padding-left:9px;padding-right:9px}.hero{grid-template-columns:108px 1fr;gap:13px}.avatar{width:98px;height:98px}.identity h1{font-size:24px}}
`;
