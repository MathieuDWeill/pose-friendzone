import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getGameState } from './game'

const WHITE = Color4.create(1, 1, 1, 1)
const MUTED = Color4.create(0.72, 0.77, 0.88, 1)
const GREEN = Color4.create(0.25, 1, 0.52, 1)
const BLUE = Color4.create(0.32, 0.68, 1, 1)
const PANEL = Color4.create(0.015, 0.02, 0.04, 0.9)

function phaseHint() {
  const s = getGameState()
  switch (s.phase) {
    case 'waiting':
      return 'Bring one person into the arena.'
    case 'training':
      return 'Solo rehearsal only — the real puzzle starts with 2 humans.'
    case 'countdown':
      return 'Get ready. The lights are about to appear.'
    case 'vouch':
      return 'VOUCH = recommend a teammate. Stand beside the person you would play with again.'
    case 'success':
      return 'Vouch recorded for this session. Next pose incoming.'
    default:
      return 'Move onto the glowing pads. One human per light.'
  }
}

function Hud() {
  const s = getGameState()
  const progress = s.targetCount > 0 ? `${s.matched}/${s.targetCount}` : `${s.playerCount}/${s.requiredPlayers}`
  const vouchLine = s.phase === 'vouch' ? ` · ${s.liveVouches} live vouch${s.liveVouches === 1 ? '' : 'es'}` : ''
  const playerLine = s.spectatorCount > 0
    ? `${s.activePlayers} playing · ${s.spectatorCount} watching`
    : `${s.activePlayers || s.playerCount} player${(s.activePlayers || s.playerCount) === 1 ? '' : 's'}`

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', pointerFilter: 'none' }}>
      <UiEntity
        uiTransform={{
          width: 560,
          height: 154,
          positionType: 'absolute',
          position: { top: 38, left: 56 },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          borderWidth: 2,
          borderColor: s.success ? GREEN : BLUE
        }}
        uiBackground={{ color: PANEL }}
      >
        <Label
          value={s.title}
          color={s.success ? GREEN : WHITE}
          fontSize={30}
          uiTransform={{ width: '100%', height: 42 }}
          textAlign="middle-center"
        />
        <Label
          value={s.subtitle}
          color={MUTED}
          fontSize={16}
          uiTransform={{ width: '100%', height: 28 }}
          textAlign="middle-center"
        />
        <Label
          value={`${progress}   ·   ${s.secondsLeft}s   ·   ${playerLine}`}
          color={WHITE}
          fontSize={16}
          uiTransform={{ width: '100%', height: 28 }}
          textAlign="middle-center"
        />
        <Label
          value={`SESSION WINS ${s.sessionWins}   ·   VOUCHES ${s.sessionVouches}${vouchLine}`}
          color={BLUE}
          fontSize={13}
          uiTransform={{ width: '100%', height: 22 }}
          textAlign="middle-center"
        />
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: 760,
          height: 48,
          positionType: 'absolute',
          position: { bottom: 52, left: 56 },
          justifyContent: 'center',
          alignItems: 'center',
          padding: 8
        }}
        uiBackground={{ color: Color4.create(0.015, 0.02, 0.04, 0.78) }}
      >
        <Label
          value={phaseHint()}
          color={MUTED}
          fontSize={15}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>
    </UiEntity>
  )
}

export function initUi() {
  ReactEcsRenderer.setUiRenderer(Hud, { virtualWidth: 1920, virtualHeight: 1080 })
}
