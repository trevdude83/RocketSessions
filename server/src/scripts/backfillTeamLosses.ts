import { db } from "../db.js";

type DerivedTeam = Record<string, number | null>;
type DeltasByPlayer = Record<number, Record<string, number | null>>;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(num) ? num : null;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function computeLosses(wins: number | null, matchesPlayed: number | null): number | null {
  if (typeof wins !== "number" || typeof matchesPlayed !== "number") return null;
  const computed = matchesPlayed - wins;
  return computed >= 0 ? computed : null;
}

const teamIdArg = toNumber(process.argv[2]);
const rows = (
  teamIdArg !== null
    ? db.prepare("SELECT id, derivedTeamJson, deltasJson FROM session_team_stats WHERE teamId = ?").all(teamIdArg)
    : db.prepare("SELECT id, derivedTeamJson, deltasJson FROM session_team_stats").all()
) as { id: number; derivedTeamJson: string | null; deltasJson: string | null }[];

const update = db.prepare(
  "UPDATE session_team_stats SET derivedTeamJson = ?, deltasJson = ? WHERE id = ?"
);

let updatedRows = 0;
let updatedLosses = 0;
let updatedPlayerLosses = 0;

const run = db.transaction(() => {
  rows.forEach((row) => {
    const derivedTeam = parseJson<DerivedTeam>(row.derivedTeamJson) ?? {};
    const deltasByPlayer = parseJson<DeltasByPlayer>(row.deltasJson) ?? {};
    let changed = false;

    const baseLosses = toNumber(derivedTeam.losses);
    const wins = toNumber(derivedTeam.wins);
    const matchesPlayed = toNumber(derivedTeam.matchesPlayed);
    const computed = baseLosses === null ? computeLosses(wins, matchesPlayed) : null;
    if (baseLosses === null && computed !== null) {
      derivedTeam.losses = computed;
      updatedLosses += 1;
      changed = true;
    }

    Object.values(deltasByPlayer).forEach((delta) => {
      const deltaLosses = toNumber(delta.losses);
      const deltaWins = toNumber(delta.wins);
      const deltaMatches = toNumber(delta.matchesPlayed);
      const computedDelta = deltaLosses === null ? computeLosses(deltaWins, deltaMatches) : null;
      if (deltaLosses === null && computedDelta !== null) {
        delta.losses = computedDelta;
        updatedPlayerLosses += 1;
        changed = true;
      }
    });

    if (changed) {
      update.run(JSON.stringify(derivedTeam), JSON.stringify(deltasByPlayer), row.id);
      updatedRows += 1;
    }
  });
});

run();

console.log(
  JSON.stringify(
    {
      teamId: teamIdArg ?? "all",
      rowsChecked: rows.length,
      rowsUpdated: updatedRows,
      teamLossesUpdated: updatedLosses,
      playerLossesUpdated: updatedPlayerLosses
    },
    null,
    2
  )
);
