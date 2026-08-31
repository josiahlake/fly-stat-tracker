"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Season = {
  id: number;
  name: string;
};

type Team = {
  id: number;
  display_name: string;
  season_id: number;
};

type Props = {
  onPlayerCreated?: (playerId: string) => void;
};

export default function FlightPathPlayerSetup({
  onPlayerCreated,
}: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setError("");

      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, name")
        .order("start_date", { ascending: false });

      if (seasonError) {
        setError(seasonError.message);
        setLoadingOptions(false);
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id, display_name, season_id")
        .order("display_name");

      if (teamError) {
        setError(teamError.message);
        setLoadingOptions(false);
        return;
      }

      const loadedSeasons = (seasonData ?? []) as Season[];
      const loadedTeams = (teamData ?? []) as Team[];

      setSeasons(loadedSeasons);
      setTeams(loadedTeams);

      if (loadedSeasons.length > 0) {
        setSeasonId(String(loadedSeasons[0].id));
      }

      setLoadingOptions(false);
    }

    loadOptions();
  }, []);

  useEffect(() => {
    setTeamId("");
  }, [seasonId]);

  const availableTeams = teams.filter(
    (team) => String(team.season_id) === seasonId
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Please sign in again before adding a player.");
      }

      const parsedBirthYear = birthYear ? Number(birthYear) : null;

      const { data: player, error: playerError } = await supabase
        .from("flight_players")
        .insert({
          created_by: user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          birth_year: parsedBirthYear,
          home_city: homeCity.trim() || null,
        })
        .select("id")
        .single();

      if (playerError) throw playerError;

      const { error: membershipError } = await supabase
        .from("flight_team_memberships")
        .insert({
          player_id: player.id,
          team_id: Number(teamId),
          season_id: Number(seasonId),
          jersey_number: jerseyNumber.trim() || null,
        });

      if (membershipError) {
        await supabase
          .from("flight_players")
          .delete()
          .eq("id", player.id);

        throw membershipError;
      }

      onPlayerCreated?.(player.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #343434",
    background: "#111111",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "15px 14px",
    fontSize: "16px",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    color: "#aaaaaa",
    marginBottom: "7px",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#ffffff",
        padding: "44px 20px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: "34px" }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.28em",
              color: "#929292",
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            THE FLY ACADEMY
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "38px",
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
            }}
          >
            Flight Path
          </h1>

          <p
            style={{
              margin: "12px 0 0",
              color: "#a5a5a5",
              fontSize: "14px",
            }}
          >
            Track your game. See your journey.
          </p>
        </div>

        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: "22px",
            padding: "26px",
            background: "#0d0d0d",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              color: "#777777",
              marginBottom: "8px",
            }}
          >
            WELCOME TO FLIGHT PATH
          </div>

          <h2
            style={{
              margin: "0 0 8px",
              fontSize: "25px",
              fontWeight: 900,
            }}
          >
            Add your player.
          </h2>

          <p
            style={{
              margin: "0 0 26px",
              color: "#969696",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            Create a private player profile. Their Flight Path stays with them
            as teams and seasons change.
          </p>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              <div>
                <label style={labelStyle}>FIRST NAME</label>
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Jemai"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>LAST NAME</label>
                <input
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Lake"
                  style={inputStyle}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              <div>
                <label style={labelStyle}>BIRTH YEAR · OPTIONAL</label>
                <input
                  type="number"
                  min="2000"
                  max="2030"
                  value={birthYear}
                  onChange={(event) => setBirthYear(event.target.value)}
                  placeholder="2013"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>CITY · OPTIONAL</label>
                <input
                  value={homeCity}
                  onChange={(event) => setHomeCity(event.target.value)}
                  placeholder="Tigard"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>SEASON</label>

              <select
                required
                value={seasonId}
                disabled={loadingOptions}
                onChange={(event) => setSeasonId(event.target.value)}
                style={inputStyle}
              >
                {loadingOptions && <option>Loading seasons...</option>}

                {!loadingOptions && seasons.length === 0 && (
                  <option value="">No active seasons available</option>
                )}

                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>TEAM</label>

              <select
                required
                value={teamId}
                disabled={loadingOptions || !seasonId}
                onChange={(event) => setTeamId(event.target.value)}
                style={inputStyle}
              >
                <option value="">Select your Fly team</option>

                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "22px" }}>
              <label style={labelStyle}>JERSEY # · OPTIONAL</label>

              <input
                value={jerseyNumber}
                onChange={(event) => setJerseyNumber(event.target.value)}
                placeholder="2"
                style={inputStyle}
              />

              <div
                style={{
                  color: "#686868",
                  fontSize: "11px",
                  marginTop: "7px",
                  lineHeight: 1.4,
                }}
              >
                You can update this when your player's jersey number changes.
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: "#3a1010",
                  border: "1px solid #7d1d1d",
                  color: "#ffb3b3",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "18px",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                saving ||
                loadingOptions ||
                !firstName ||
                !lastName ||
                !seasonId ||
                !teamId
              }
              style={{
                width: "100%",
                border: "none",
                borderRadius: "12px",
                padding: "16px",
                background: "#ffffff",
                color: "#000000",
                fontSize: "14px",
                fontWeight: 900,
                cursor: saving ? "default" : "pointer",
                opacity:
                  saving ||
                  loadingOptions ||
                  !firstName ||
                  !lastName ||
                  !seasonId ||
                  !teamId
                    ? 0.55
                    : 1,
              }}
            >
              {saving ? "ADDING PLAYER..." : "ADD PLAYER →"}
            </button>
          </form>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: "22px",
            color: "#626262",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          PRIVATE BY DEFAULT. SHARED BY CHOICE.
        </div>
      </section>
    </main>
  );
}
