# POSE × Vouch — Humans are the puzzle

**A mobile-first social formation game for the Decentraland Friendzone Mobile Buildathon.**

> Two to eight humans. One formation. Move together before time runs out.

POSE turns the avatars already inside Decentraland into the game pieces. Players enter a tiny arena, see a formation, and physically move onto glowing pads together. The entire interaction is based on movement, so it is naturally suited to mobile and requires no custom keyboard controls, inventory, combat system, wallet flow, AI model, or external backend.

## Why POSE

Friendzone rewards social value, mobile UX, performance, originality, retention, and execution. POSE deliberately targets those criteria with one mechanic instead of a large world:

- **Mobile-first:** movement is the only gameplay input.
- **Social by construction:** the real puzzle begins with 2+ humans.
- **Solo-safe judging:** one player gets a tiny rehearsal so a judge never lands in a dead scene.
- **Instant onboarding:** glowing pads communicate the goal without a tutorial wall.
- **Lightweight:** primitive meshes only; no heavy GLB assets.
- **Short rounds:** synchronized 20-second rounds create immediate retries.
- **2–8 active players:** extra visitors can watch without breaking the round.
- **Photo-friendly formations:** line, circle, diamond, zigzag, heart, and arrow.
- **Open source:** intentionally small TypeScript codebase under MIT.

## Core loop

1. Enter the arena.
2. If alone, stand on the center light to learn the mechanic.
3. With 2+ players, a synchronized countdown starts.
4. A formation and glowing pads appear.
5. One avatar must occupy each light.
6. Correct pads turn green.
7. Hold the complete pose for ~1 second.
8. **PERFECT!** — then the next global round begins automatically.

## Technical design

The MVP intentionally has **no external backend**. Each client reads the player entities exposed by Decentraland using `PlayerIdentityData` and a guarded `Transform.getOrNull(entity)`, derives the same round from wall-clock time, derives the same deterministic formation, and computes occupancy locally.

The occupancy solver uses **maximum bipartite matching**, not a naive nearest-player greedy algorithm. This matters when two target radii overlap: a player that can stand on either pad should not accidentally steal the only pad another player can reach.

### Files

```text
src/index.ts        entry point
src/game.ts         arena, rounds, avatar tracking, presentation state
src/core.ts         pure deterministic target + matching algorithms
src/ui.tsx          mobile-safe React-ECS HUD
scripts/verify-project.mjs  offline project sanity checks
docs/               submission/judge/test material
```

## Run

Requirements: Node.js 20+ and Decentraland Creator Hub / SDK tooling.

```bash
npm install
npm run verify
npm run build
npm run start
```

Or open the project folder from Creator Hub and run the scene from the editor.

## Multiplayer test

The social game activates with at least two avatars inside the parcel. With a single avatar, POSE enters **WARM UP** mode instead of presenting an empty/dead experience.

Recommended test matrix:

- 1 player: rehearsal target appears.
- 2 players: first real cooperative pose.
- 4 players: representative judging/demo case.
- 8 players: maximum active group.
- 9+ players: eight nearest-to-center avatars play; others are shown as spectators.

## Scope discipline

Not in the MVP on purpose:

- custom matchmaking,
- wallets/NFT rewards,
- combat,
- inventories,
- AI,
- external databases,
- custom mobile controls,
- heavyweight art pipeline.

The point is to maximize **social interaction per line of code** and keep the mobile performance risk low.

## Submission pitch

> **POSE turns Decentraland avatars into the game pieces.** Two to eight strangers have seconds to physically arrange themselves into a shared formation. No weapons. No menus. No solo grind. Just people, movement, and the tiny panic of figuring it out together.

**Tagline:** `HUMANS ARE THE PUZZLE.`

See `docs/SUBMISSION_COPY.md` and `docs/JUDGE_QUICKSTART.md` for ready-to-use hackathon material.

## Vouch layer

Every solved formation unlocks a five-second **Vouch Round**.

**WHO DO YOU VOUCH FOR?** Stand beside the teammate you would choose to play with again. Each avatar can vouch for at most one teammate: the nearest eligible teammate inside the Vouch radius.

The competition build keeps vouches session-local: no token, wallet transaction, negative rating, paid API, database, or permanent public reputation is required.

**POSE creates the interaction. Vouch captures the trust signal.**
