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
    title: 'MAKE A LINE',
    subtitle: 'One human on every light',
    normalizedTargets: [
      { x: -1, z: 0 }, { x: -0.72, z: 0 }, { x: -0.43, z: 0 }, { x: -0.14, z: 0 },
      { x: 0.14, z: 0 }, { x: 0.43, z: 0 }, { x: 0.72, z: 0 }, { x: 1, z: 0 }
    ]
  },
  {
    id: 'circle',
    title: 'MAKE A CIRCLE',
    subtitle: 'Spread around the ring',
    normalizedTargets: [
      { x: 0, z: -1 }, { x: 0.72, z: -0.72 }, { x: 1, z: 0 }, { x: 0.72, z: 0.72 },
      { x: 0, z: 1 }, { x: -0.72, z: 0.72 }, { x: -1, z: 0 }, { x: -0.72, z: -0.72 }
    ]
  },
  {
    id: 'diamond',
    title: 'MAKE A DIAMOND',
    subtitle: 'Find your corner',
    normalizedTargets: [
      { x: 0, z: -1 }, { x: 0.65, z: -0.55 }, { x: 1, z: 0 }, { x: 0.65, z: 0.55 },
      { x: 0, z: 1 }, { x: -0.65, z: 0.55 }, { x: -1, z: 0 }, { x: -0.65, z: -0.55 }
    ]
  },
  {
    id: 'zigzag',
    title: 'MAKE A ZIGZAG',
    subtitle: 'Alternate left and right',
    normalizedTargets: [
      { x: -0.9, z: -0.9 }, { x: 0.9, z: -0.65 }, { x: -0.9, z: -0.4 }, { x: 0.9, z: -0.15 },
      { x: -0.9, z: 0.15 }, { x: 0.9, z: 0.4 }, { x: -0.9, z: 0.65 }, { x: 0.9, z: 0.9 }
    ]
  },
  {
    id: 'heart',
    title: 'MAKE A HEART',
    subtitle: 'Friendzone finale',
    normalizedTargets: [
      { x: -0.6, z: -0.55 }, { x: 0.6, z: -0.55 }, { x: -1, z: 0 }, { x: 1, z: 0 },
      { x: -0.55, z: 0.55 }, { x: 0.55, z: 0.55 }, { x: 0, z: 1 }, { x: 0, z: 0.2 }
    ]
  },
  {
    id: 'arrow',
    title: 'MAKE AN ARROW',
    subtitle: 'Point together',
    normalizedTargets: [
      { x: -0.95, z: 0 }, { x: -0.55, z: 0 }, { x: -0.15, z: 0 }, { x: 0.25, z: 0 },
      { x: 0.55, z: -0.45 }, { x: 1, z: 0 }, { x: 0.55, z: 0.45 }, { x: 0.65, z: 0 }
    ]
  }
]

const targetEntities: Entity[] = []
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
  success: false,
  sessionWins: 0,
  sessionVouches: 0,
  liveVouches: 0
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

  titleEntity = engine.addEntity()
  Transform.create(titleEntity, {
    position: Vector3.create(8, 4.65, 14.7),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  TextShape.create(titleEntity, {
    text: 'POSE',
    fontSize: 4,
    textColor: Color4.White(),
    outlineColor: Color3.create(0, 0, 0),
    outlineWidth: 0.12
  })

  subtitleEntity = engine.addEntity()
  Transform.create(subtitleEntity, {
    position: Vector3.create(8, 3.85, 14.68),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })
  TextShape.create(subtitleEntity, {
    text: 'HUMANS ARE THE PUZZLE',
    fontSize: 1.15,
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
      scale: Vector3.create(1.7, 0.05, 1.7)
    })
    MeshRenderer.setCylinder(entity, 0.5, 0.5)
    Material.setPbrMaterial(entity, {
      albedoColor: Color4.create(0.08, 0.45, 1, 0.9),
      emissiveColor: Color3.create(0.05, 0.5, 1),
      emissiveIntensity: 2.4,
      roughness: 0.3
    })
    targetEntities.push(entity)
  }

  for (let i = 0; i < targetEntities.length; i++) {
    Transform.getMutable(targetEntities[i]).scale =
      i < count ? Vector3.create(1.7, 0.05, 1.7) : Vector3.create(0, 0, 0)
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
      albedoColor: matched ? Color4.create(0.15, 1, 0.45, 0.95) : Color4.create(0.08, 0.45, 1, 0.9),
      emissiveColor: matched ? Color3.create(0.08, 1, 0.4) : Color3.create(0.05, 0.5, 1),
      emissiveIntensity: matched ? 4.2 : 2.4,
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
  const allPlayers = playersInsideArena(getPlayers())
  const playerCount = allPlayers.length
  const activePlayers = Math.min(playerCount, MAX_ACTIVE_PLAYERS)
  const spectatorCount = Math.max(0, playerCount - activePlayers)

  if (roundKey !== lastRoundKey) {
    lastRoundKey = roundKey
    successSince = 0
    roundCompletedAt = 0
  }

  // Solo rehearsal: judges can understand and test the core movement without faking multiplayer.
  if (playerCount === 1) {
    const trainingTargets: Vec2[] = [{ x: ARENA_CENTER.x, z: ARENA_CENTER.z }]
    const matched = matchPlayersToTargets(allPlayers, trainingTargets, TARGET_RADIUS)
    updateTargets(trainingTargets, matched)
    updateWorldSign(matched.size === 1 ? 'NICE.' : 'WARM UP', 'BRING A FRIEND FOR THE REAL PUZZLE')
    setState({
      phase: 'training',
      playerCount,
      activePlayers: 1,
      spectatorCount: 0,
      requiredPlayers: MIN_SOCIAL_PLAYERS,
      round: roundKey,
      title: matched.size === 1 ? 'NICE.' : 'WARM UP',
      subtitle: matched.size === 1 ? 'Now bring one person' : 'Stand on the glowing light',
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
      ensureTargetEntities(0)
      const remaining = Math.max(1, Math.ceil(VOUCH_WINDOW_SECONDS - elapsedSinceSolve))
      updateWorldSign('VOUCH', 'STAND BESIDE THE TEAMMATE YOU RECOMMEND')
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
      updateWorldSign('VOUCHED.', `${outgoing.size} RECOMMENDATION${outgoing.size === 1 ? '' : 'S'}`)
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
