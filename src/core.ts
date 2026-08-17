export type Vec2 = { x: number; z: number }
export type PlayerPoint = { id: string; x: number; z: number }

export function deterministicIndex(seed: number, length: number): number {
  if (length <= 0) return 0
  const hashed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  return hashed % length
}

export function centeredTargets(
  normalizedTargets: Vec2[],
  count: number,
  center: Vec2,
  radius: number
): Vec2[] {
  const selected = normalizedTargets.slice(0, count)
  if (selected.length === 0) return []
  const meanX = selected.reduce((sum, p) => sum + p.x, 0) / selected.length
  const meanZ = selected.reduce((sum, p) => sum + p.z, 0) / selected.length
  return selected.map((p) => ({
    x: center.x + (p.x - meanX) * radius,
    z: center.z + (p.z - meanZ) * radius
  }))
}

// Maximum bipartite matching: each avatar can occupy at most one target and vice versa.
export function matchPlayersToTargets(players: PlayerPoint[], targets: Vec2[], targetRadius: number): Set<number> {
  const radiusSquared = targetRadius * targetRadius
  const adjacency: number[][] = players.map((player) => {
    const candidates: Array<{ target: number; d2: number }> = []
    targets.forEach((target, index) => {
      const dx = player.x - target.x
      const dz = player.z - target.z
      const d2 = dx * dx + dz * dz
      if (d2 <= radiusSquared) candidates.push({ target: index, d2 })
    })
    candidates.sort((a, b) => a.d2 - b.d2)
    return candidates.map((c) => c.target)
  })

  const targetOwner = new Array<number>(targets.length).fill(-1)

  function assign(playerIndex: number, seen: boolean[]): boolean {
    for (const targetIndex of adjacency[playerIndex]) {
      if (seen[targetIndex]) continue
      seen[targetIndex] = true
      const owner = targetOwner[targetIndex]
      if (owner === -1 || assign(owner, seen)) {
        targetOwner[targetIndex] = playerIndex
        return true
      }
    }
    return false
  }

  players.forEach((_, playerIndex) => assign(playerIndex, new Array<boolean>(targets.length).fill(false)))

  const matched = new Set<number>()
  targetOwner.forEach((owner, targetIndex) => {
    if (owner !== -1) matched.add(targetIndex)
  })
  return matched
}
