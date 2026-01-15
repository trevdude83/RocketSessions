export const tierNames: Record<number, string> = {
  0: "Unranked",
  1: "Bronze I",
  2: "Bronze II",
  3: "Bronze III",
  4: "Silver I",
  5: "Silver II",
  6: "Silver III",
  7: "Gold I",
  8: "Gold II",
  9: "Gold III",
  10: "Platinum I",
  11: "Platinum II",
  12: "Platinum III",
  13: "Diamond I",
  14: "Diamond II",
  15: "Diamond III",
  16: "Champion I",
  17: "Champion II",
  18: "Champion III",
  19: "Grand Champion I",
  20: "Grand Champion II",
  21: "Grand Champion III",
  22: "Supersonic Legend"
};

export const divisionNames: Record<number, string> = {
  0: "Division I",
  1: "Division II",
  2: "Division III",
  3: "Division IV",
  4: "Division IV"
};

export function formatRank(points: number | null): string {
  if (points === null || !Number.isFinite(points)) return "Unknown";
  const tierIndex = Math.floor(points / 10);
  const divisionIndex = points % 10;
  const tier = tierNames[tierIndex] ?? `Tier ${tierIndex}`;
  const division = divisionNames[divisionIndex];
  return division ? `${tier} ${division}` : tier;
}

export function formatRankShort(points: number | null): string {
  if (points === null || !Number.isFinite(points)) return "Unknown";
  const tierIndex = Math.floor(points / 10);
  return tierNames[tierIndex] ?? `Tier ${tierIndex}`;
}
