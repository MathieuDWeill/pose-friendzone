# POSE Test Plan

## Build gate

```bash
npm run verify
npm run build
```

Both commands must exit 0 before deployment.

## Functional tests

### T1 — Empty scene
Expected: `FIND A FRIEND`, no target pads visible, no exceptions.

### T2 — One player
Expected: one center training pad; stepping onto it turns it green and the UI explains that the real puzzle begins with two humans.

### T3 — Two players
Expected: synchronized countdown, two pads, one avatar per target, success after both hold position.

### T4 — Overlapping target tolerance
Expected: the maximum-matching solver assigns avatars without a false failure when one avatar can reach two candidate pads.

### T5 — Round rollover
Expected: at the 20-second boundary the next deterministic formation appears and success state resets.

### T6 — Four players
Expected: four active targets; no duplicate avatar can satisfy multiple targets.

### T7 — Eight players
Expected: eight active targets and responsive HUD.

### T8 — Nine or more visitors
Expected: the eight avatars closest to the arena center are active and the remainder are counted as spectators.

## Mobile checks

- UI remains inside safe screen area.
- No keyboard-only action is necessary.
- Native movement joystick remains usable.
- HUD does not cover the central play area.
- 30+ FPS target on representative mobile hardware.

## Failure checks

- Player leaves during a round: target count adapts without crash.
- Player Transform temporarily unavailable: ignored safely.
- Guest identity: address field still handled without relying on a profile name.
- Late join: player sees the same globally timed round as existing clients.
