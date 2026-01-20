import { test } from "node:test";
import assert from "node:assert/strict";
import { hashBuffer, hashString } from "./dedupe.js";
import { mapPlayers, normalizeName } from "./playerMapper.js";
import { parseScoreboardExtraction } from "./visionExtractor.js";

test("hash helpers are deterministic", () => {
  const buffer = Buffer.from("scoreboard");
  assert.equal(hashBuffer(buffer), hashBuffer(buffer));
  assert.equal(hashString("rocket"), hashString("rocket"));
});

test("player mapper normalizes names", () => {
  const identities = [{ playerId: 1, gamertag: "Trevdude83", platform: "xbl" }];
  const extracted = [{ name: "trev dude83", goals: 1, assists: 0, saves: 0, shots: 2, score: 100 }];
  const result = mapPlayers(extracted, identities);
  assert.equal(result[0].playerId, 1);
  assert.ok((result[0].confidence ?? 0) >= 0.9);
  assert.equal(normalizeName("Trev Dude83"), "trevdude83");
});

test("scoreboard extraction JSON validates", () => {
  const payload = JSON.stringify({
    match: { playlistName: "Ranked Doubles 2v2", isRanked: true, winningTeam: "blue" },
    teams: {
      blue: [{ name: "Alpha", goals: 2, assists: 1, saves: 0, shots: 3, score: 450 }],
      orange: [{ name: "Beta", goals: 1, assists: 0, saves: 1, shots: 2, score: 380 }]
    }
  });
  const parsed = parseScoreboardExtraction(payload);
  assert.ok(parsed);
  assert.equal(parsed?.match.winningTeam, "blue");
});
