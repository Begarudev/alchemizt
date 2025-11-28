import assert from "node:assert/strict";
import type { MatchMode } from "@alchemizt/contracts";
import { getPuzzleById, listPuzzles } from "../puzzleCatalog.js";

const puzzles = listPuzzles();

assert(
  Array.isArray(puzzles) && puzzles.length >= 20,
  `expected at least 20 puzzles, received ${puzzles.length}`,
);

for (const entry of puzzles) {
  const { metadata, timerPreset } = entry;
  assert(metadata.id, "puzzle id missing");
  assert(metadata.title, `title missing for ${metadata.id}`);
  assert(metadata.topicTags.length > 0, `topic tags missing for ${metadata.id}`);
  assert(metadata.allowedReactions.length > 0, `allowed reactions missing for ${metadata.id}`);
  assert(
    metadata.modeAvailability.every(
      (mode: MatchMode) => mode === "speedrun" || mode === "endurance",
    ),
    `unsupported mode in ${metadata.id}`,
  );
  assert(timerPreset.countdownSeconds >= 3, `countdown too low for ${metadata.id}`);
  assert(timerPreset.totalSeconds > timerPreset.countdownSeconds, `total seconds invalid for ${metadata.id}`);
  const lookup = getPuzzleById(metadata.id);
  assert(lookup, `lookup failed for ${metadata.id}`);
  assert.strictEqual(lookup, entry, `lookup entry mismatch for ${metadata.id}`);
}

// eslint-disable-next-line no-console -- intentional test output
console.info(`[tests] puzzle catalog validated (${puzzles.length} entries)`);

