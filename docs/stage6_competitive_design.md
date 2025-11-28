# Stage 6 Competitive Systems Design

## Rating System

- **Model**: Variant of Glicko-2 tuned for chemistry match dynamics. Each profile tracks `rating`, `rating deviation (RD)`, and `volatility`. Baseline rating is 1500 / RD 350 / volatility 0.06 to converge within the first 5–7 rated matches.
- **Update cadence**: Ratings update after every rated lobby match and at contest checkpoints. Per-match expected scores consider puzzle tier weight, time remaining, and referee confidence—so clutch solves against high-tier puzzles move the needle more than trivial wins.
- **Initialization & placements**:
  - New players complete three unrated “lab calibration” puzzles to estimate execution accuracy; those results set an initial hidden rating used for matchmaking but surface only after the fifth rated match.
  - Accelerated placements: if a player’s calibration variance is low, RD starts at 250 to reduce volatility.
- **Teams / duos**: Team rating uses the mean of member ratings minus a coordination tax (default 30 points, decaying for established parties). RD combines via root-mean-square so lopsided teams inherit higher uncertainty.
- **Inactivity**: RD inflates by 2% per idle week (cap at 400) to reflect decayed certainty; after re-entry, the first two matches apply a 1.25× K-factor to re-anchor quickly.
- **Confidence handling**:
  - RD bounds rating swings: the K-factor scales with `(RD / 200)`, clamping drastic jumps for veterans while letting new players move faster.
  - Volatility spikes when actual performance deviates from expectation by >2σ, ensuring the system adapts when someone improves sharply or declines.
- **Contest aggregation**: Multi-round events compute a weighted expected score (later rounds + harder puzzles weigh 1.4×). A contest’s net delta is applied once to reduce per-round jitter while still rewarding consistency.

## Matchmaking Rules

- **Primary queue**: Players enter mode-specific queues (speedrun, endurance, sandbox). The matchmaker sorts by adjusted rating (`rating ± RD padding`) and forms matches where max spread ≤120 points. It recalculates every 10 seconds.
- **Dynamic widening**: If a player waits >30 seconds, allowable spread expands to 200; at 60 seconds, 280; at 90 seconds, 360. Expectations adjust accordingly so rating changes remain fair despite mismatched pairings.
- **Population-aware bots**: During low-pop windows, curated “chem-bot” opponents fill gaps. Bots mirror average tier skill, intentionally play 5–10% below expectation, and award at most +8 rating to avoid farming. Losses to bots still cost rating to maintain stakes.
- **Party & squad logic**: Duos/triads match on average rating plus a cohesion penalty. Newly formed groups gain +40 effective rating (harder matches) until they log 10 games together; established squads drop to +15, reducing queue time while acknowledging synergy.
- **Mode isolation**: Sandbox queues relax spread caps to 400 and never grant more than ±5 rating, functioning as a testing ground. Ranked ladders (speedrun/endurance) remain strict to preserve integrity.
- **Fallback async trials**: If no opponents surface within 3 minutes, players can accept an asynchronous puzzle duel: they solve a seed puzzle, and the server later pairs them with the next challenger’s time. RD still tightens; rating movement occurs when the matchup resolves.
- **Regional shards & failover**: Regions share rating pools but prefer intra-region matches to minimize latency. If local population dips, players can opt into global matching with a warning that latency may affect timers; countdown authority always stays server-side.

## Progression & Rewards

- **Divisions & ranks**: Bronze → Argentum → Aurum → Platinum → Iridium → Philosopher, each with five sub-ranks (V–I). Promotions grant animated lobby frames and countdown ring skins, reinforcing visible status.
- **Specializations**: Completing themed puzzle arcs (e.g., “Organometallic”, “Photoredox”) unlocks specialization badges displayed on RoomCards, encouraging breadth across chemistry domains.
- **Unlockable content**:
  - Tier promotions open harder molecule packs and experimental match mods (limited reagents, blind timers).
  - Seasonal tokens earned through weekly objectives purchase cosmetic lab backdrops and emote particles.
- **Seasonal ladder**: Every 10 weeks, soft reset nudges players halfway toward their division midpoint while preserving badges. Seasonal leaderboards award relics (profile ornaments, trail effects) for top 5%, top 1%, and regional champions.
- **Event circuits**: Weekend Labs (solo) and Co-op Gauntlets (duo) rotate with unique scoring twists. Participation grants catalyst shards used to craft rare cosmetics, promoting varied play beyond pure ladder grinding.
- **Behavior incentives**: Leaderboard snapshots highlight “Most Improved RD”, “Consistency Streak”, and “Puzzle Diversity” to reward both high skill and healthy engagement patterns.

## Assumptions & Open Questions

1. Does the RD inflation schedule prevent dormant high-rated players from smurfing, or do we need decay caps per tier?
2. Should chem-bot matches ever award full rating changes if they convincingly outperform humans, or will that feel punitive?
3. What safeguards stop coordinated groups from abusing cohesion penalties to dodge fair matches?
4. How do we validate that asynchronous duel outcomes feel as meaningful as live matches, especially when delays occur?
5. Do seasonal soft resets need tier-specific offsets so Philosopher ranks don’t crash into Iridium at season start?
6. Are specialization unlocks balanced so they encourage exploring new chemistry topics without overwhelming casual players?
7. Should contest weighting favor late rounds this heavily, or do we risk discouraging early-round upsets?

## Prototype Implementation Snapshot (Stage 6)

- **Match Orchestrator**: Extended the service with a Glicko-lite rating store, queue ticket management, bot fillers, and result ingestion endpoints (`/matchmaking/enqueue`, `/competitive/dashboard`, `/competitive/matches/:roomId/result`), aligning directly with the above design.
- **Rating/queue telemetry**: Each `MatchRoom` now carries `RoomCompetitiveContext`, exposing expected deltas, spread caps, and bot-fill metadata so consumers can visualize competitive context inline.
- **Frontend lobby**: The Vite shell surfaces live ladder snapshots, queue depth cards, pairing history, and ready/queue controls tied to the player handle, enabling “Stage 6” flows without leaving the lobby.
- **Contracts package**: Shared types for ladder snapshots, tickets, dashboards, and competitive metadata ensure backend and frontend stay in lockstep as we iterate toward the next milestone.


