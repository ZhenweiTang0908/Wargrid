import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei'
import { CircleHelp, RotateCcw, SkipForward, Swords, Volume2, VolumeX, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore, isCellReachable } from './game/store'
import { CARD_COPY, CARD_LABEL, SUIT_GLYPH, type Card, type Position, type Team } from './types'
import { canSlash, samePosition, terrainAt } from './game/rules'

const TILE_GAP = 1.06
const worldPosition = (p: Position): [number, number, number] => [(p.x - 4) * TILE_GAP, 0, (p.y - 4) * TILE_GAP]

function Tile({ position }: { position: Position }) {
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const hoverCell = useGameStore(s => s.hoverCell)
  const reachable = isCellReachable(state.reachable, position)
  const inPath = isCellReachable(state.pathPreview, position)
  const control = samePosition(state.controlPoint, position)
  const occupied = Object.values(state.units).some(u => samePosition(u.position, position))
  const obstacle = state.obstacles.some(o => samePosition(o, position))
  const terrain = terrainAt(state, position)
  const [hovered, setHovered] = useState(false)
  const terrainColor = terrain === 'water' ? '#173e51' : terrain === 'forest' ? '#193b2d' : terrain === 'ridge' ? '#3c3831' : terrain === 'road' ? '#3b352b' : terrain === 'camp' ? '#493328' : ((position.x + position.y) % 2 ? '#132c32' : '#17363d')
  const color = obstacle ? '#453f36' : control ? '#8c652c' : inPath ? '#53bfd1' : reachable ? '#234e5c' : terrainColor

  return (
    <group position={worldPosition(position)}>
      <mesh
        position-y={obstacle ? .42 : 0}
        scale={hovered && reachable ? 1.04 : 1}
        onPointerEnter={e => { e.stopPropagation(); setHovered(true); hoverCell(position); document.body.style.cursor = reachable ? 'pointer' : 'default' }}
        onPointerLeave={() => { setHovered(false); hoverCell(null); document.body.style.cursor = 'default' }}
        onClick={e => { e.stopPropagation(); if (reachable && !occupied) dispatch({ type: 'MOVE', unit: 'player', to: position }) }}
      >
        <boxGeometry args={[.98, obstacle ? .82 : .12, .98]} />
        <meshStandardMaterial color={color} roughness={.72} metalness={control ? .25 : .05} emissive={inPath ? '#147a89' : control ? '#3d2207' : '#000'} emissiveIntensity={.55} />
      </mesh>
      {control && !obstacle && (
        <group position-y={.12}>
          <mesh rotation-x={-Math.PI / 2}>
            <torusGeometry args={[.3, .035, 8, 32]} />
            <meshStandardMaterial color="#f2c66d" emissive="#cc842d" emissiveIntensity={1.2} />
          </mesh>
          <Sparkles count={12} scale={.75} size={2} speed={.3} color="#f2c66d" />
        </group>
      )}
      {terrain === 'forest' && !obstacle && <group position={[-.16, .13, .08]}><mesh position-y={.23}><cylinderGeometry args={[.05, .08, .4, 6]} /><meshStandardMaterial color="#5f4530" /></mesh><mesh position-y={.54}><coneGeometry args={[.25, .56, 7]} /><meshStandardMaterial color="#28553a" /></mesh></group>}
      {terrain === 'water' && <mesh position-y={.09} rotation-x={-Math.PI / 2}><planeGeometry args={[.75, .75]} /><meshStandardMaterial color="#2b7290" transparent opacity={.34} roughness={.2} /></mesh>}
      {terrain === 'camp' && <group position={[.22, .12, .1]}><mesh position-y={.35}><cylinderGeometry args={[.025, .025, .7]} /><meshStandardMaterial color="#6e4b2d" /></mesh><mesh position={[.16, .55, 0]}><planeGeometry args={[.34, .24]} /><meshStandardMaterial color={position.y < 4 ? '#a83d35' : '#257c91'} side={THREE.DoubleSide} /></mesh></group>}
    </group>
  )
}

function UnitPiece({ team }: { team: Team }) {
  const unit = useGameStore(s => s.units[team])
  const selectedCardId = useGameStore(s => s.selectedCardId)
  const selectedAsSlash = useGameStore(s => s.selectedAsSlash)
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const resetAnimation = useGameStore(s => s.resetAnimation)
  const group = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(...worldPosition(unit.position)), [unit.position])
  const color = team === 'player' ? '#35b8d4' : '#e25845'
  const selectedKind = selectedAsSlash ? 'slash' : state.units.player.hand.find(c => c.id === selectedCardId)?.kind
  const canTarget = team === 'enemy' && !!selectedCardId && !!selectedKind && (
    (selectedKind === 'slash' && canSlash(state, state.units.player, unit)) ||
    selectedKind === 'duel' || selectedKind === 'dismantle' ||
    selectedKind === 'indulgence' ||
    (selectedKind === 'snatch' && Math.abs(state.units.player.position.x - unit.position.x) + Math.abs(state.units.player.position.y - unit.position.y) <= 1)
  )

  useEffect(() => {
    if (unit.animation === 'idle') return
    const timer = window.setTimeout(() => resetAnimation(team), unit.animation === 'move' ? 700 : 480)
    return () => window.clearTimeout(timer)
  }, [unit.animation, resetAnimation, team])

  useFrame(({ clock }, delta) => {
    if (!group.current) return
    group.current.position.lerp(target, Math.min(1, delta * 7))
    const idle = Math.sin(clock.elapsedTime * 2.2 + (team === 'enemy' ? 1 : 0)) * .035
    group.current.position.y = idle + (unit.animation === 'heal' ? Math.abs(Math.sin(clock.elapsedTime * 10)) * .12 : 0)
    const desiredScale = unit.animation === 'hit' ? .9 + Math.abs(Math.sin(clock.elapsedTime * 25)) * .12 : 1
    group.current.scale.lerp(new THREE.Vector3(desiredScale, desiredScale, desiredScale), delta * 10)
  })

  return (
    <group
      ref={group}
      position={worldPosition(unit.position)}
      onClick={e => {
        e.stopPropagation()
        if (canTarget && selectedCardId) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: 'enemy', asSlash: selectedAsSlash })
      }}
      onPointerEnter={() => { if (canTarget) document.body.style.cursor = 'crosshair' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      {canTarget && (
        <mesh position-y={.06} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[.47, .56, 32]} />
          <meshBasicMaterial color="#ffcb70" transparent opacity={.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh position-y={.18} castShadow>
        <cylinderGeometry args={[.38, .45, .28, 12]} />
        <meshStandardMaterial color={color} roughness={.34} metalness={.45} />
      </mesh>
      <mesh position-y={.7} castShadow>
        <cylinderGeometry args={[.28, .34, .8, 10]} />
        <meshStandardMaterial color={team === 'player' ? '#14748a' : '#972f2b'} roughness={.55} />
      </mesh>
      <mesh position-y={1.2} castShadow>
        <sphereGeometry args={[.29, 16, 12]} />
        <meshStandardMaterial color="#d6b28a" roughness={.8} />
      </mesh>
      <mesh position={[0, 1.42, 0]} rotation-z={team === 'player' ? -.18 : .18}>
        <coneGeometry args={[.27, .42, 6]} />
        <meshStandardMaterial color={color} metalness={.35} />
      </mesh>
      <group position={team === 'player' ? [.43, .75, 0] : [-.4, .82, 0]} rotation-z={team === 'player' ? -.18 : .2}>
        <mesh position-y={.25}>
          <cylinderGeometry args={[.025, .025, 1.7, 6]} />
          <meshStandardMaterial color="#7b5531" roughness={.7} />
        </mesh>
        {team === 'player' ? <>
          <mesh position={[0, 1.14, 0]} rotation-z={-.35}>
            <boxGeometry args={[.13, .65, .055]} />
            <meshStandardMaterial color="#b7c7c5" metalness={.85} roughness={.2} />
          </mesh>
          <mesh position={[0, .82, 0]}><torusGeometry args={[.1, .025, 6, 14]} /><meshStandardMaterial color="#d8a94d" metalness={.7} /></mesh>
        </> : <mesh position={[0, 1.08, 0]}><coneGeometry args={[.13, .48, 5]} /><meshStandardMaterial color="#c7d0cc" metalness={.9} roughness={.18} /></mesh>}
      </group>
      <mesh position={[0, .78, .18]} rotation-x={-.18}>
        <planeGeometry args={[.62, .88]} />
        <meshStandardMaterial color={team === 'player' ? '#173c43' : '#501e1c'} side={THREE.DoubleSide} roughness={.9} />
      </mesh>
      {unit.animation === 'heal' && <Sparkles count={28} scale={1.35} size={4} speed={1} color="#78e89b" position-y={.7} />}
      {unit.hp <= 0 && <mesh position-y={.5}><sphereGeometry args={[.8]} /><meshBasicMaterial color="#000" transparent opacity={.6} /></mesh>}
    </group>
  )
}

function Battlefield() {
  const size = useGameStore(s => s.size)
  const cells = useMemo(() => Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) })), [size])
  return (
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [9.7, 11.5, 10.7], fov: 40 }} gl={{ antialias: true }}>
      <color attach="background" args={['#071016']} />
      <fog attach="fog" args={['#071016', 11, 19]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 9, 5]} intensity={2.1} color="#d5f3ee" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-5, 3, -4]} intensity={18} distance={10} color="#277b96" />
      <pointLight position={[5, 3, 4]} intensity={12} distance={9} color="#8c3b2c" />
      <Suspense fallback={null}>
        <group position-y={-.05}>
          {cells.map(p => <Tile key={`${p.x}-${p.y}`} position={p} />)}
          <UnitPiece team="player" />
          <UnitPiece team="enemy" />
        </group>
        <RoundedBox args={[10.4, .35, 10.4]} radius={.12} smoothness={2} position-y={-.28} receiveShadow>
          <meshStandardMaterial color="#091c21" roughness={.9} metalness={.12} />
        </RoundedBox>
        <ContactShadows opacity={.65} scale={11} blur={2.4} far={5} color="#000000" />
        <Environment preset="night" />
      </Suspense>
      <OrbitControls makeDefault target={[0, .1, 0]} minDistance={13} maxDistance={18} minPolarAngle={.55} maxPolarAngle={1.12} minAzimuthAngle={-.8} maxAzimuthAngle={.8} enablePan={false} />
    </Canvas>
  )
}

function Hearts({ hp, max }: { hp: number; max: number }) {
  return <div className="hearts" aria-label={`${hp}/${max} 体力`}>{Array.from({ length: max }, (_, i) => <span key={i} className={i < hp ? 'full' : ''}>◆</span>)}</div>
}

function PlayerStatus({ team }: { team: Team }) {
  const unit = useGameStore(s => s.units[team])
  const score = useGameStore(s => s.scores[team])
  return (
    <section className={`status ${team}`}>
      <div className="avatar">{team === 'player' ? '苍' : '赤'}</div>
      <div className="status-copy">
        <div className="name-row"><strong>{unit.name}</strong><span>{team === 'player' ? '玩家' : 'AI'}</span></div>
        <Hearts hp={unit.hp} max={unit.maxHp} />
        <div className="status-meta"><span>手牌 {unit.hand.length}</span><span>据点 {score}/3</span></div>
        <div className="equipment-line">{unit.equipment.weapon ? CARD_LABEL[unit.equipment.weapon.kind] : '无武器'} · {unit.equipment.armor ? CARD_LABEL[unit.equipment.armor.kind] : '无防具'}{unit.judgement.length ? ` · 判定 ${unit.judgement.map(c => CARD_LABEL[c.kind]).join('/')}` : ''}</div>
        <div className="skill-line">{unit.skill === 'wusheng' ? '武圣 · 红牌可化杀' : '刚烈 · 受伤摸一牌'}</div>
      </div>
    </section>
  )
}

function CardView({ card, selected }: { card: Card; selected: boolean }) {
  const selectCard = useGameStore(s => s.selectCard)
  const state = useGameStore()
  const disabled = state.phase !== 'player' || (card.kind === 'peach' && state.units.player.hp >= state.units.player.maxHp) || (card.kind === 'slash' && state.units.player.attacksUsed >= (state.units.player.equipment.weapon?.kind === 'crossbow' ? Infinity : 1)) || (card.kind === 'wine' && state.units.player.wineUsed)
  const red = card.suit === 'heart' || card.suit === 'diamond'
  return (
    <button className={`card ${card.kind} ${selected ? 'selected' : ''}`} disabled={disabled} onClick={() => selectCard(card.id)}>
      <span className={`card-suit ${red ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong>
      <small>{CARD_COPY[card.kind]}</small>
    </button>
  )
}

function Tutorial({ close }: { close: () => void }) {
  return <div className="overlay"><section className="tutorial panel">
    <button className="icon-button close" onClick={close} aria-label="关闭引导"><X /></button>
    <span className="eyebrow">战术简报</span>
    <h1>逐鹿中原，决胜九宫</h1>
    <div className="steps">
      <div><b>01</b><strong>移动</strong><p>点击青色高亮格。每回合可移动 3 格，并能分段行动。</p></div>
      <div><b>02</b><strong>出牌</strong><p>基础牌、锦囊与装备遵循标准牌逻辑；需要目标时点击敌将。</p></div>
      <div><b>03</b><strong>判定</strong><p>乐不思蜀与闪电进入判定区；无懈可击会自动响应锦囊。</p></div>
    </div>
    <button className="primary" onClick={close}>进入战场</button>
  </section></div>
}

function App() {
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const [sound, setSound] = useState(true)
  const [tutorial, setTutorial] = useState(() => localStorage.getItem('wargrid-tutorial') !== 'seen')
  const selectedCard = state.units.player.hand.find(c => c.id === state.selectedCardId)
  const canWusheng = selectedCard && selectedCard.kind !== 'slash' && (selectedCard.suit === 'heart' || selectedCard.suit === 'diamond')
  const closeTutorial = () => { localStorage.setItem('wargrid-tutorial', 'seen'); setTutorial(false) }

  useEffect(() => {
    const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => document.removeEventListener('touchmove', prevent)
  }, [])

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">W</span><div><strong>WARGRID</strong><small>第 {state.turn} 回合</small></div></div>
      <div className={`turn-indicator ${state.phase}`}><span />{state.phase === 'player' ? '你的回合' : state.phase === 'ai' ? '敌方回合' : '战局结束'}</div>
      <div className="header-actions">
        <button className="icon-button" onClick={() => setTutorial(true)} aria-label="查看规则"><CircleHelp /></button>
        <button className="icon-button" onClick={() => setSound(v => !v)} aria-label="切换音效">{sound ? <Volume2 /> : <VolumeX />}</button>
        <button className="icon-button" onClick={() => dispatch({ type: 'RESTART' })} aria-label="重新开始"><RotateCcw /></button>
      </div>
    </header>

    <aside className="status-left"><PlayerStatus team="player" /></aside>
    <aside className="status-right"><PlayerStatus team="enemy" /></aside>
    <div className="battlefield"><Battlefield /></div>

    <div className="message-bar"><span className="message-pip" />{state.message}</div>

    <footer className="command-deck">
      <div className="movement"><span>{state.turnStage === 'play' ? '出牌阶段' : state.turnStage}</span><div>{[1, 2, 3].map(n => <i key={n} className={n <= state.units.player.movement ? 'active' : ''} />)}</div></div>
      <div className="hand" aria-label="你的手牌">
        {state.units.player.hand.map(card => <CardView key={card.id} card={card} selected={selectedCard?.id === card.id} />)}
        {!state.units.player.hand.length && <span className="empty-hand">暂无手牌</span>}
      </div>
      <div className="turn-actions">
        {canWusheng && <button className={`secondary skill-action ${state.selectedAsSlash ? 'active' : ''}`} onClick={() => state.activateWusheng()}><Swords />武圣</button>}
        {state.selectedCardId && <button className="secondary" onClick={() => state.selectCard(null)}><X />取消</button>}
        <button className="end-turn" disabled={state.phase !== 'player'} onClick={() => dispatch({ type: 'END_TURN' })}><SkipForward />结束回合</button>
      </div>
    </footer>

    {tutorial && <Tutorial close={closeTutorial} />}
    {state.winner && <div className="overlay"><section className={`result panel ${state.winner}`}>
      <span className="eyebrow">战局结束</span>
      <div className="result-seal">{state.winner === 'player' ? '胜' : '败'}</div>
      <h1>{state.winner === 'player' ? '中枢已归我方' : '赤军占据了战场'}</h1>
      <p>历经 {state.turn} 回合 · 据点比分 {state.scores.player} : {state.scores.enemy}</p>
      <button className="primary" onClick={() => dispatch({ type: 'RESTART' })}><RotateCcw />再战一局</button>
    </section></div>}

    <div className="portrait-warning"><RotateCcw /><strong>请横屏游玩</strong><span>旋转设备以展开完整战场</span></div>
  </main>
}

export default App
