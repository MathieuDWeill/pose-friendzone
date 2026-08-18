import {
  engine,
  Entity,
  Material,
  MeshCollider,
  MeshRenderer,
  PlayerIdentityData,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { centeredTargets, deterministicIndex, matchPlayersToTargets, PlayerPoint, Vec2 } from './core'

export type GamePhase = 'training' | 'waiting' | 'countdown' | 'active' | 'vouch' | 'success'

type Formation = {
  id: string
  theme: string
  title: string
  subtitle: string
  normalizedTargets: Vec2[]
}

export type PublicGameState = {
  phase: GamePhase
  playerCount: number
  activePlayers: number
  spectatorCount: number
  requiredPlayers: number
  round: number
  title: string
  subtitle: string
  secondsLeft: number
  matched: number
  targetCount: number
  success: boolean
  sessionWins: number
  sessionVouches: number
  liveVouches: number
}

const ROUND_SECONDS = 20
const COUNTDOWN_SECONDS = 3
const SUCCESS_HOLD_SECONDS = 1.1
const VOUCH_WINDOW_SECONDS = 5
const VOUCH_DISTANCE = 2.1
const MIN_SOCIAL_PLAYERS = 2
const MAX_ACTIVE_PLAYERS = 8
const ARENA_CENTER = { x: 8, z: 8 }
const ARENA_RADIUS = 4.35
const TARGET_RADIUS = 1.2

const formations: Formation[] = [
  {
    id: 'line',
    theme: 'POWER',
    title: 'MAKE A LINE',
    subtitle: 'One human on every light',
    normalizedTargets: [
      { x: -1, z: 0 }, { x: -0.72, z: 0 }, { x: -0.43, z: 0 }, { x: -0.14, z: 0 },
      { x: 0.14, z: 0 }, { x: 0.43, z: 0 }, { x: 0.72, z: 0 }, { x: 1, z: 0 }
    ]
  },
  {
    id: 'circle',
    theme: 'VOYAGE',
    title: 'MAKE A CIRCLE',
    subtitle: 'Spread around the ring',
    normalizedTargets: [
      { x: 0, z: -1 }, { x: 0.72, z: -0.72 }, { x: 1, z: 0 }, { x: 0.72, z: 0.72 },
      { x: 0, z: 1 }, { x: -0.72, z: 0.72 }, { x: -1, z: 0 }, { x: -0.72, z: -0.72 }
    ]
  },
  {
    id: 'diamond',
    theme: 'SHADOW',
    title: 'MAKE A DIAMOND',
    subtitle: 'Find your corner',
    normalizedTargets: [
      { x: 0, z: -1 }, { x: 0.65, z: -0.55 }, { x: 1, z: 0 }, { x: 0.65, z: 0.55 },
      { x: 0, z: 1 }, { x: -0.65, z: 0.55 }, { x: -1, z: 0 }, { x: -0.65, z: -0.55 }
    ]
  },
  {
    id: 'zigzag',
    theme: 'MECHA',
    title: 'MAKE A ZIGZAG',
    subtitle: 'Alternate left and right',
    normalizedTargets: [
      { x: -0.9, z: -0.9 }, { x: 0.9, z: -0.65 }, { x: -0.9, z: -0.4 }, { x: 0.9, z: -0.15 },
      { x: -0.9, z: 0.15 }, { x: 0.9, z: 0.4 }, { x: -0.9, z: 0.65 }, { x: 0.9, z: 0.9 }
    ]
  },
  {
    id: 'heart',
    theme: 'MAGIC',
    title: 'MAKE A HEART',
    subtitle: 'Friendzone finale',
    normalizedTargets: [
      { x: -0.6, z: -0.55 }, { x: 0.6, z: -0.55 }, { x: -1, z: 0 }, { x: 1, z: 0 },
      { x: -0.55, z: 0.55 }, { x: 0.55, z: 0.55 }, { x: 0, z: 1 }, { x: 0, z: 0.2 }
    ]
  },
  {
    id: 'arrow',
    theme: 'SPIRIT',
    title: 'MAKE AN ARROW',
    subtitle: 'Point together',
    normalizedTargets: [
      { x: -0.95, z: 0 }, { x: -0.55, z: 0 }, { x: -0.15, z: 0 }, { x: 0.25, z: 0 },
      { x: 0.55, z: -0.45 }, { x: 1, z: 0 }, { x: 0.55, z: 0.45 }, { x: 0.65, z: 0 }
    ]
  }
]

const targetEntities: Entity[] = []
const successBurstEntities: Entity[] = []
let titleEntity: Entity | undefined
let subtitleEntity: Entity | undefined
let lastRoundKey = -1
let successSince = 0
let lastSuccessRound = -1
let sessionWins = 0
let sessionVouches = 0
let roundCompletedAt = 0
let vouchCommittedRound = -1
const vouchesReceived = new Map<string, number>()

let state: PublicGameState = {
  phase: 'waiting',
  playerCount: 0,
  activePlayers: 0,
  spectatorCount: 0,
  requiredPlayers: MIN_SOCIAL_PLAYERS,
  round: 0,
  title: 'POSE',
  subtitle: 'Humans are the puzzle',
  secondsLeft: ROUND_SECONDS,
  matched: 0,
  targetCount: 0,
      liveVouches: 0,
  success: false,
  sessionWins: 0,
  sessionVouches: 0,
}

export function getGameState(): PublicGameState {
  return state
}

function createBox(
  position: { x: number; y: number; z: number },
  scale: { x: number; y: number; z: number },
  color: Color4,
  emissive?: Color3
): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    emissiveColor: emissive ?? Color3.create(color.r, color.g, color.b),
    emissiveIntensity: 0.2,
    roughness: 0.6,
    metallic: 0.05
  })
  return entity
}

function createArena() {
  // Kept primitive-only for the mobile MVP. These entities are intentionally tiny and cheap.
  createBox({ x: 8, y: 0.02, z: 8 }, { x: 15.4, y: 0.04, z: 15.4 }, Color4.create(0.025, 0.03, 0.05, 1))

  const border = Color4.create(0.10, 0.12, 0.18, 1)
  createBox({ x: 8, y: 0.20, z: 0.35 }, { x: 15.4, y: 0.38, z: 0.22 }, border)
  createBox({ x: 8, y: 0.20, z: 15.65 }, { x: 15.4, y: 0.38, z: 0.22 }, border)
  createBox({ x: 0.35, y: 0.20, z: 8 }, { x: 0.22, y: 0.38, z: 15.4 }, border)
  createBox({ x: 15.65, y: 0.20, z: 8 }, { x: 0.22, y: 0.38, z: 15.4 }, border)

  // Competition polish: lightweight neon stage, still primitive-only for mobile.
  const cyan = Color4.create(0.08, 0.78, 1, 1)
  const violet = Color4.create(0.62, 0.22, 1, 1)
  const pink = Color4.create(1, 0.18, 0.62, 1)
  const panel = Color4.create(0.02, 0.025, 0.055, 0.98)

  createBox({ x: 8, y: 0.09, z: 2.15 }, { x: 11.7, y: 0.05, z: 0.08 }, cyan, Color3.create(0.08, 0.78, 1))
  createBox({ x: 8, y: 0.09, z: 13.85 }, { x: 11.7, y: 0.05, z: 0.08 }, violet, Color3.create(0.62, 0.22, 1))
  createBox({ x: 2.15, y: 0.09, z: 8 }, { x: 0.08, y: 0.05, z: 11.7 }, pink, Color3.create(1, 0.18, 0.62))
  createBox({ x: 13.85, y: 0.09, z: 8 }, { x: 0.08, y: 0.05, z: 11.7 }, cyan, Color3.create(0.08, 0.78, 1))

  for (const x of [4, 6, 8, 10, 12]) {
    createBox({ x, y: 0.045, z: 8 }, { x: 0.025, y: 0.018, z: 10.4 }, Color4.create(0.10, 0.16, 0.26, 0.55))
  }
  for (const z of [4, 6, 8, 10, 12]) {
    createBox({ x: 8, y: 0.046, z }, { x: 10.4, y: 0.018, z: 0.025 }, Color4.create(0.10, 0.16, 0.26, 0.55))
  }

  createBox({ x: 2.15, y: 0.75, z: 2.15 }, { x: 0.20, y: 1.45, z: 0.20 }, cyan, Color3.create(0.08, 0.78, 1))
  createBox({ x: 13.85, y: 0.75, z: 2.15 }, { x: 0.20, y: 1.45, z: 0.20 }, violet, Color3.create(0.62, 0.22, 1))
  createBox({ x: 2.15, y: 0.75, z: 13.85 }, { x: 0.20, y: 1.45, z: 0.20 }, pink, Color3.create(1, 0.18, 0.62))
  createBox({ x: 13.85, y: 0.75, z: 13.85 }, { x: 0.20, y: 1.45, z: 0.20 }, cyan, Color3.create(0.08, 0.78, 1))

  createBox({ x: 8, y: 4.25, z: 15.18 }, { x: 10.2, y: 2.45, z: 0.14 }, panel)
  createBox({ x: 8, y: 5.52, z: 15.10 }, { x: 10.4, y: 0.06, z: 0.10 }, cyan, Color3.create(0.08, 0.78, 1))
  createBox({ x: 8, y: 2.98, z: 15.10 }, { x: 10.4, y: 0.06, z: 0.10 }, pink, Color3.create(1, 0.18, 0.62))

  // ANIME TRIBUTE RING
  // Original geometric easter eggs inspired by broad anime archetypes.
  // No licensed characters, logos, names, or copied assets.

  const orange = Color4.create(1.0, 0.42, 0.06, 1)
  const gold = Color4.create(1.0, 0.78, 0.12, 1)
  const crimson = Color4.create(0.92, 0.08, 0.16, 1)
  const indigo = Color4.create(0.24, 0.16, 0.62, 1)
  const aqua = Color4.create(0.10, 0.92, 0.95, 1)
  const magenta = Color4.create(1.0, 0.16, 0.70, 1)
  const whiteGlow = Color3.create(0.95, 0.98, 1.0)

  // POWER shrine — orange/gold energy archetype.
  createBox({ x: 1.10, y: 1.00, z: 4.00 }, { x: 0.22, y: 2.00, z: 0.22 }, orange, Color3.create(1, 0.35, 0.04))
  createBox({ x: 1.10, y: 1.90, z: 4.00 }, { x: 1.10, y: 0.12, z: 0.12 }, gold, Color3.create(1, 0.75, 0.08))
  createBox({ x: 1.10, y: 1.45, z: 4.00 }, { x: 0.62, y: 0.10, z: 0.62 }, gold, Color3.create(1, 0.75, 0.08))

  // VOYAGE shrine — mast/compass archetype.
  createBox({ x: 14.90, y: 1.05, z: 4.00 }, { x: 0.18, y: 2.10, z: 0.18 }, Color4.create(0.40, 0.19, 0.08, 1))
  createBox({ x: 14.90, y: 1.55, z: 4.00 }, { x: 1.00, y: 0.10, z: 0.10 }, gold, Color3.create(1, 0.72, 0.08))
  createBox({ x: 14.90, y: 1.55, z: 4.00 }, { x: 0.10, y: 0.10, z: 1.00 }, gold, Color3.create(1, 0.72, 0.08))

  // SHADOW gate — shinobi/torii archetype.
  createBox({ x: 1.05, y: 0.95, z: 8.00 }, { x: 0.18, y: 1.90, z: 0.18 }, crimson, Color3.create(0.90, 0.05, 0.10))
  createBox({ x: 2.05, y: 0.95, z: 8.00 }, { x: 0.18, y: 1.90, z: 0.18 }, crimson, Color3.create(0.90, 0.05, 0.10))
  createBox({ x: 1.55, y: 1.86, z: 8.00 }, { x: 1.42, y: 0.14, z: 0.28 }, crimson, Color3.create(0.90, 0.05, 0.10))
  createBox({ x: 1.55, y: 1.52, z: 8.00 }, { x: 1.05, y: 0.10, z: 0.20 }, indigo, Color3.create(0.20, 0.10, 0.55))

  // MECHA core — angular neon machinery archetype.
  createBox({ x: 14.90, y: 0.95, z: 8.00 }, { x: 0.85, y: 1.90, z: 0.18 }, Color4.create(0.12, 0.16, 0.22, 1))
  createBox({ x: 14.90, y: 1.05, z: 7.88 }, { x: 0.36, y: 0.36, z: 0.08 }, aqua, Color3.create(0.05, 0.95, 1))
  createBox({ x: 14.42, y: 1.22, z: 8.00 }, { x: 0.18, y: 0.72, z: 0.18 }, aqua, Color3.create(0.05, 0.95, 1))
  createBox({ x: 15.38, y: 1.22, z: 8.00 }, { x: 0.18, y: 0.72, z: 0.18 }, aqua, Color3.create(0.05, 0.95, 1))

  // MAGIC sigil — pink star/wand archetype.
  createBox({ x: 1.15, y: 0.08, z: 12.15 }, { x: 1.30, y: 0.04, z: 0.10 }, magenta, Color3.create(1, 0.10, 0.68))
  createBox({ x: 1.15, y: 0.08, z: 12.15 }, { x: 0.10, y: 0.04, z: 1.30 }, magenta, Color3.create(1, 0.10, 0.68))
  createBox({ x: 1.15, y: 0.12, z: 12.15 }, { x: 0.62, y: 0.04, z: 0.62 }, Color4.create(1, 0.72, 0.92, 1), Color3.create(1, 0.55, 0.88))

  // SPIRIT blade — luminous sword archetype.
  createBox({ x: 14.90, y: 1.05, z: 12.20 }, { x: 0.10, y: 1.65, z: 0.20 }, Color4.create(0.78, 0.95, 1, 1), whiteGlow)
  createBox({ x: 14.90, y: 0.40, z: 12.20 }, { x: 0.75, y: 0.10, z: 0.18 }, indigo, Color3.create(0.35, 0.22, 0.75))
  createBox({ x: 14.90, y: 0.15, z: 12.20 }, { x: 0.18, y: 0.42, z: 0.18 }, Color4.create(0.12, 0.10, 0.16, 1))

  for (const [x, z, color, emissive] of [
    [8, 5.25, cyan, Color3.create(0.08, 0.78, 1)],
    [10.75, 8, pink, Color3.create(1, 0.18, 0.62)],
    [8, 10.75, violet, Color3.create(0.62, 0.22, 1)],
    [5.25, 8, gold, Color3.create(1, 0.78, 0.12)]
  ] as const) {
    const burst = createBox({ x, y: 1.10, z }, { x: 0.16, y: 2.2, z: 0.16 }, color, emissive)
    Transform.getMutable(burst).scale = Vector3.create(0, 0, 0)
    successBurstEntities.push(burst)
  }

  titleEntity = engine.addEntity()
  Transform.create(titleEntity, {
    position: Vector3.create(8, 4.60, 15.00),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0)
  })
  TextShape.create(titleEntity, {
    text: 'POSE × VOUCH',
    fontSize: 5,
    textColor: Color4.White(),
    outlineColor: Color3.create(0, 0, 0),
    outlineWidth: 0.12
  })

  subtitleEntity = engine.addEntity()
  Transform.create(subtitleEntity, {
    position: Vector3.create(8, 3.72, 14.98),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0)
  })
  TextShape.create(subtitleEntity, {
    text: 'HUMANS ARE THE PUZZLE',
    fontSize: 1.35,
    textColor: Color4.create(0.55, 0.75, 1, 1)
  })

  const collider = engine.addEntity()
  Transform.create(collider, { position: Vector3.create(8, 0.01, 8), scale: Vector3.create(15, 0.02, 15) })
  MeshCollider.setBox(collider)
}

function ensureTargetEntities(count: number) {
  while (targetEntities.length < count) {
    const entity = engine.addEntity()
    Transform.create(entity, {
      position: Vector3.create(8, 0.07, 8),
      scale: Vector3.create(2.0, 0.06, 2.0)
    })
    MeshRenderer.setCylinder(entity, 0.5, 0.5)
    Material.setPbrMaterial(entity, {
      albedoColor: Color4.create(0.12, 0.72, 1, 0.96),
      emissiveColor: Color3.create(0.08, 0.72, 1),
      emissiveIntensity: 4.0,
      roughness: 0.3
    })
    targetEntities.push(entity)
  }

  for (let i = 0; i < targetEntities.length; i++) {
    Transform.getMutable(targetEntities[i]).scale =
      i < count ? Vector3.create(2.0, 0.06, 2.0) : Vector3.create(0, 0, 0)
  }
}

function setSuccessBurst(visible: boolean) {
  for (const entity of successBurstEntities) {
    Transform.getMutable(entity).scale = visible ? Vector3.create(0.16, 2.2, 0.16) : Vector3.create(0, 0, 0)
  }
}

function worldTargets(formation: Formation, count: number): Vec2[] {
  return centeredTargets(formation.normalizedTargets, count, ARENA_CENTER, ARENA_RADIUS)
}

function updateTargets(targets: Vec2[], matchedTargets: Set<number>, visible = true) {
  ensureTargetEntities(visible ? targets.length : 0)
  if (!visible) return

  targets.forEach((target, index) => {
    Transform.getMutable(targetEntities[index]).position = Vector3.create(target.x, 0.07, target.z)
    const matched = matchedTargets.has(index)
    Material.setPbrMaterial(targetEntities[index], {
      albedoColor: matched ? Color4.create(0.18, 1, 0.48, 0.98) : Color4.create(0.12, 0.72, 1, 0.96),
      emissiveColor: matched ? Color3.create(0.08, 1, 0.4) : Color3.create(0.08, 0.72, 1),
      emissiveIntensity: matched ? 5.0 : 4.0,
      roughness: 0.3
    })
  })
}

function getPlayers(): PlayerPoint[] {
  const players: PlayerPoint[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const transform = Transform.getOrNull(entity)
    if (!transform) continue
    players.push({ id: identity.address, x: transform.position.x, z: transform.position.z })
  }
  return players
}

function playersInsideArena(players: PlayerPoint[]) {
  return players
    .filter((p) => p.x >= 0.5 && p.x <= 15.5 && p.z >= 0.5 && p.z <= 15.5)
    .sort((a, b) => {
      const da = (a.x - ARENA_CENTER.x) ** 2 + (a.z - ARENA_CENTER.z) ** 2
      const db = (b.x - ARENA_CENTER.x) ** 2 + (b.z - ARENA_CENTER.z) ** 2
      return da - db
    })
}

function deterministicFormationIndex(roundKey: number): number {
  return deterministicIndex(roundKey, formations.length)
}

function updateWorldSign(title: string, subtitle: string) {
  if (titleEntity) TextShape.getMutable(titleEntity).text = title
  if (subtitleEntity) TextShape.getMutable(subtitleEntity).text = subtitle
}

function setState(next: Omit<PublicGameState, 'sessionWins' | 'sessionVouches'>) {
  state = { ...next, sessionWins, sessionVouches }
}

function calculateVouches(players: PlayerPoint[]): Map<string, string> {
  const outgoing = new Map<string, string>()
  const maxD2 = VOUCH_DISTANCE * VOUCH_DISTANCE
  for (const player of players) {
    let best: PlayerPoint | undefined
    let bestD2 = Number.POSITIVE_INFINITY
    for (const other of players) {
      if (other.id === player.id) continue
      const dx = player.x - other.x
      const dz = player.z - other.z
      const d2 = dx * dx + dz * dz
      if (d2 <= maxD2 && d2 < bestD2) {
        best = other
        bestD2 = d2
      }
    }
    if (best) outgoing.set(player.id, best.id)
  }
  return outgoing
}

function commitVouches(roundKey: number, outgoing: Map<string, string>) {
  if (vouchCommittedRound === roundKey) return
  vouchCommittedRound = roundKey
  sessionVouches += outgoing.size
  for (const recipient of outgoing.values()) {
    vouchesReceived.set(recipient, (vouchesReceived.get(recipient) ?? 0) + 1)
  }
}

function gameSystem() {
  const nowSec = Date.now() / 1000
  const roundKey = Math.floor(nowSec / ROUND_SECONDS)
  const secondsIntoRound = nowSec - roundKey * ROUND_SECONDS
  const secondsLeft = Math.max(0, Math.ceil(ROUND_SECONDS - secondsIntoRound))
  const detectedPlayers = getPlayers()
  const arenaPlayers = playersInsideArena(detectedPlayers)
  const allPlayers = arenaPlayers.length === 0 && detectedPlayers.length === 1 ? detectedPlayers : arenaPlayers
  const playerCount = allPlayers.length
  const activePlayers = Math.min(playerCount, MAX_ACTIVE_PLAYERS)
  const spectatorCount = Math.max(0, playerCount - activePlayers)

  if (roundKey !== lastRoundKey) {
    lastRoundKey = roundKey
    successSince = 0
    roundCompletedAt = 0
    setSuccessBurst(false)
  }

  // Solo rehearsal: judges can understand and test the core movement without faking multiplayer.
  if (playerCount === 1) {
    const trainingTargets: Vec2[] = [{ x: ARENA_CENTER.x, z: ARENA_CENTER.z }]
    const matched = matchPlayersToTargets(allPlayers, trainingTargets, TARGET_RADIUS)
    updateTargets(trainingTargets, matched)
    updateWorldSign(matched.size === 1 ? 'NICE.' : 'SOLO MODE', matched.size === 1 ? 'BRING ONE HUMAN TO UNLOCK THE REAL GAME' : 'ENTER THE RING · STAND ON THE LIGHT')
    setState({
      phase: 'training',
      playerCount,
      activePlayers: 1,
      spectatorCount: 0,
      requiredPlayers: MIN_SOCIAL_PLAYERS,
      round: roundKey,
      title: matched.size === 1 ? 'NICE.' : 'SOLO MODE',
      subtitle: matched.size === 1 ? 'Now bring one person' : 'Enter the ring · stand on the glowing light',
      secondsLeft,
      matched: matched.size,
      targetCount: 1,
      liveVouches: 0,
      success: false
    })
    return
  }

  if (playerCount < MIN_SOCIAL_PLAYERS) {
    ensureTargetEntities(0)
    updateWorldSign('FIND A FRIEND', '2 PLAYERS UNLOCK THE PUZZLE')
    setState({
      phase: 'waiting',
      playerCount,
      activePlayers: 0,
      spectatorCount: 0,
      requiredPlayers: MIN_SOCIAL_PLAYERS,
      round: roundKey,
      title: 'FIND A FRIEND',
      subtitle: '2 players unlock the puzzle',
      secondsLeft,
      matched: 0,
      targetCount: 0,
      liveVouches: 0,
      success: false
    })
    return
  }

  const formation = formations[deterministicFormationIndex(roundKey)]
  const active = allPlayers.slice(0, activePlayers)
  const targets = worldTargets(formation, activePlayers)

  if (lastSuccessRound === roundKey) {
    const elapsedSinceSolve = Math.max(0, nowSec - roundCompletedAt)
    const vouching = elapsedSinceSolve < VOUCH_WINDOW_SECONDS
    const outgoing = calculateVouches(active)

    if (vouching) {
      setSuccessBurst(false)
      ensureTargetEntities(0)
      const remaining = Math.max(1, Math.ceil(VOUCH_WINDOW_SECONDS - elapsedSinceSolve))
      updateWorldSign('VOUCH', 'STAND BY THE TEAMMATE YOU WOULD PLAY WITH AGAIN')
      setState({
        phase: 'vouch',
        playerCount,
        activePlayers,
        spectatorCount,
        requiredPlayers: MIN_SOCIAL_PLAYERS,
        round: roundKey,
        title: 'WHO DO YOU VOUCH FOR?',
        subtitle: 'Stand beside one teammate',
        secondsLeft: remaining,
        matched: targets.length,
        targetCount: targets.length,
        liveVouches: outgoing.size,
        success: true
      })
    } else {
      commitVouches(roundKey, outgoing)
      updateTargets(targets, new Set(targets.map((_, i) => i)))
      updateWorldSign('VOUCHED ✓', `${outgoing.size} TRUST SIGNAL${outgoing.size === 1 ? '' : 'S'}`)
      setState({
        phase: 'success',
        playerCount,
        activePlayers,
        spectatorCount,
        requiredPlayers: MIN_SOCIAL_PLAYERS,
        round: roundKey,
        title: 'VOUCHED.',
        subtitle: `${outgoing.size} teammate recommendation${outgoing.size === 1 ? '' : 's'}`,
        secondsLeft,
        matched: targets.length,
        targetCount: targets.length,
        liveVouches: outgoing.size,
        success: true
      })
    }
    return
  }

  if (secondsIntoRound < COUNTDOWN_SECONDS) {
    updateTargets(targets, new Set<number>(), false)
    const countdown = Math.max(1, Math.ceil(COUNTDOWN_SECONDS - secondsIntoRound))
    updateWorldSign(String(countdown), formation.title)
    setState({
      phase: 'countdown',
      playerCount,
      activePlayers,
      spectatorCount,
      requiredPlayers: MIN_SOCIAL_PLAYERS,
      round: roundKey,
      title: `${countdown}`,
      subtitle: formation.title,
      secondsLeft: countdown,
      matched: 0,
      targetCount: targets.length,
      liveVouches: 0,
      success: false
    })
    return
  }

  const matched = matchPlayersToTargets(active, targets, TARGET_RADIUS)
  const isComplete = matched.size === targets.length

  if (isComplete) {
    if (successSince === 0) successSince = nowSec
    if (nowSec - successSince >= SUCCESS_HOLD_SECONDS) {
      lastSuccessRound = roundKey
      roundCompletedAt = nowSec
      sessionWins += 1
      setSuccessBurst(true)
    }
  } else {
    successSince = 0
  }

  updateTargets(targets, matched)
  updateWorldSign(isComplete ? 'HOLD IT!' : formation.title, isComplete ? 'DON’T MOVE…' : formation.subtitle.toUpperCase())
  setState({
    phase: 'active',
    playerCount,
    activePlayers,
    spectatorCount,
    requiredPlayers: MIN_SOCIAL_PLAYERS,
    round: roundKey,
    title: isComplete ? 'HOLD IT!' : formation.title,
    subtitle: isComplete ? 'Don’t move…' : formation.subtitle,
    secondsLeft,
    matched: matched.size,
    targetCount: targets.length,
      liveVouches: 0,
    success: isComplete
  })
}

export function initGame() {
  createArena()
  engine.addSystem(gameSystem)
}
