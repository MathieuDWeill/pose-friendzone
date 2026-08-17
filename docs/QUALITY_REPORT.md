# POSE v0.2 — Pre-download Quality Report

## Validated in the build environment

- `scene.json`, `package.json`, and `tsconfig.json` parse correctly.
- Scene base parcel is part of the declared parcel list.
- Scene tags use the currently documented supported values.
- Thumbnail exists and is 1024×576 PNG.
- Source contains no TODO/FIXME placeholders.
- Basic private-key / 32-byte hex secret scan is clean.
- `PlayerIdentityData` is only used for its documented identity fields; the invalid `identity.name` usage from the first draft was removed.
- Player `Transform` is read defensively with `Transform.getOrNull`.
- React-ECS renderer has an explicit 1920×1080 virtual canvas.
- Solo rehearsal exists, so a single judge does not land in a dead scene.
- Core matching logic is extracted into a pure module and passed local algorithm tests.
- The matching test includes an ambiguous overlap case that can defeat naive greedy matching.
- A TypeScript structural check against local SDK API stubs passes.
- GitHub Actions CI is included to install the real SDK and run `verify` + `build` after push.

## Not possible to validate in this environment

The environment cannot currently resolve the npm registry, so the real `@dcl/sdk` packages could not be installed here. Because of that, `sdk-commands build` and an actual Explorer/Creator Hub render could not be executed locally before packaging.

This is the remaining hard gate. On a machine with npm connectivity, run:

```bash
./run_pose.sh
```

or:

```bash
npm install
npm run verify
npm run build
npm run start
```

Any real-SDK compile/runtime issue should be treated as a release blocker before deployment.

## Intentional MVP trade-off

The arena is created from SDK primitives in TypeScript for a compact hackathon prototype. Current Decentraland creator guidance prefers load-time scenery in `assets/scene/main.composite`. Moving the static arena shell into a composite is a cleanup optimization, but it is intentionally deferred until the first successful real Creator Hub import so that hand-authoring composite metadata does not introduce a larger compatibility risk than the simple primitive setup.
