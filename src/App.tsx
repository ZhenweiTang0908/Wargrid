import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei'
import { CircleHelp, RotateCcw, ScrollText, SkipForward, Swords, Volume2, VolumeX, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore, isCellReachable } from './game/store'
import { CARD_COPY, CARD_LABEL, IDENTITY_LABEL, SUIT_GLYPH, type Card, type Faction, type GeneralSkill, type Position, type Team } from './types'
import { canSlash, combatDistance, samePosition, slashLimit, terrainAt } from './game/rules'

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
  const mapObject = state.mapObjects.find(item => samePosition(item.position, position))
  const selectedCard = state.units.player.hand.find(card => card.id === state.selectedCardId)
  const canInteract = !!mapObject && !mapObject.claimed && !!selectedCard && state.phase === 'player' && state.currentUnit === 'player' && state.turnStage === 'play' && Math.abs(state.units.player.position.x - position.x) + Math.abs(state.units.player.position.y - position.y) <= 1
  const [hovered, setHovered] = useState(false)
  const terrainColor = terrain === 'water' ? '#173e51' : terrain === 'forest' ? '#193b2d' : terrain === 'ridge' ? '#3c3831' : terrain === 'road' ? '#3b352b' : terrain === 'camp' ? '#493328' : ((position.x + position.y) % 2 ? '#132c32' : '#17363d')
  const color = obstacle ? '#453f36' : control ? '#8c652c' : inPath ? '#53bfd1' : reachable ? '#234e5c' : terrainColor

  return (
    <group position={worldPosition(position)}>
      <mesh
        position-y={obstacle ? .42 : 0}
        scale={hovered && reachable ? 1.04 : 1}
        onPointerEnter={e => { e.stopPropagation(); setHovered(true); hoverCell(position); document.body.style.cursor = reachable || canInteract ? 'pointer' : 'default' }}
        onPointerLeave={() => { setHovered(false); hoverCell(null); document.body.style.cursor = 'default' }}
        onClick={e => { e.stopPropagation(); if (canInteract && mapObject && selectedCard) dispatch({ type: 'INTERACT', unit: 'player', objectId: mapObject.id, cardId: selectedCard.id }); else if (reachable && !occupied) dispatch({ type: 'MOVE', unit: 'player', to: position }) }}
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
      {mapObject && <group position={[.24, .15, -.22]} rotation-y={-.18}>
        <mesh position-y={.14}><boxGeometry args={[.4, .25, .32]} /><meshStandardMaterial color={mapObject.claimed ? '#514a3d' : '#8b5528'} roughness={.72} /></mesh>
        <mesh position={[0, mapObject.claimed ? .32 : .29, mapObject.claimed ? -.13 : 0]} rotation-x={mapObject.claimed ? -1.1 : 0}><boxGeometry args={[.4, .1, .32]} /><meshStandardMaterial color={mapObject.claimed ? '#4c463c' : '#aa6e32'} roughness={.65} /></mesh>
        {[-.13, .13].map(x => <mesh key={x} position={[x, .17, .002]}><boxGeometry args={[.035, .34, .34]} /><meshStandardMaterial color="#c3a45a" metalness={.65} roughness={.3} /></mesh>)}
        {!mapObject.claimed && <><Sparkles count={8} scale={.65} size={2} speed={.35} color={canInteract ? '#fff0a8' : '#dbbc72'} /><mesh position-y={.04} rotation-x={-Math.PI / 2}><ringGeometry args={[.3, .38, 24]} /><meshBasicMaterial color={canInteract ? '#ffe080' : '#9d7440'} transparent opacity={canInteract ? .9 : .45} side={THREE.DoubleSide} /></mesh></>}
      </group>}
      {terrain === 'forest' && !obstacle && <group position={[-.16, .13, .08]}><mesh position-y={.23}><cylinderGeometry args={[.05, .08, .4, 6]} /><meshStandardMaterial color="#5f4530" /></mesh><mesh position-y={.54}><coneGeometry args={[.25, .56, 7]} /><meshStandardMaterial color="#28553a" /></mesh></group>}
      {terrain === 'road' && !control && <group position-y={.09}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.46, .92]} /><meshStandardMaterial color="#65543d" roughness={1} /></mesh>
        {[-.25, .02, .28].map((z, i) => <mesh key={i} position={[i % 2 ? .11 : -.09, .012, z]} rotation-x={-Math.PI / 2}><boxGeometry args={[.22, .012, .06]} /><meshStandardMaterial color="#8a7658" roughness={1} /></mesh>)}
      </group>}
      {terrain === 'water' && <group position-y={.09}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.82, .82]} /><meshStandardMaterial color="#2b7290" transparent opacity={.42} roughness={.15} metalness={.15} /></mesh>
        {[-.2, .08, .27].map((z, i) => <mesh key={i} position={[i % 2 ? .14 : -.13, .018, z]} rotation-x={-Math.PI / 2}><torusGeometry args={[.12, .012, 4, 16, Math.PI]} /><meshBasicMaterial color="#78bdd0" transparent opacity={.5} /></mesh>)}
      </group>}
      {terrain === 'ridge' && !obstacle && <group position-y={.13}>
        <mesh position={[-.18, .17, .1]} rotation={[.2, .1, -.18]}><dodecahedronGeometry args={[.23, 0]} /><meshStandardMaterial color="#665e50" roughness={.95} /></mesh>
        <mesh position={[.16, .11, -.12]} rotation={[-.1, .2, .3]}><dodecahedronGeometry args={[.16, 0]} /><meshStandardMaterial color="#4d4a42" roughness={1} /></mesh>
      </group>}
      {terrain === 'camp' && <group position={[.12, .12, .08]}>
        <mesh position={[-.2, .2, 0]} rotation-y={Math.PI / 4}><coneGeometry args={[.28, .38, 4]} /><meshStandardMaterial color={position.y < 4 ? '#713029' : '#1d5967'} roughness={.9} /></mesh>
        <mesh position={[.2, .35, .08]}><cylinderGeometry args={[.025, .025, .7]} /><meshStandardMaterial color="#6e4b2d" /></mesh>
        <mesh position={[.36, .55, .08]}><planeGeometry args={[.34, .24]} /><meshStandardMaterial color={position.y < 4 ? '#a83d35' : '#257c91'} side={THREE.DoubleSide} /></mesh>
      </group>}
      {obstacle && <group position-y={.82}>
        <mesh position-y={.18} rotation-y={Math.PI / 4}><dodecahedronGeometry args={[.36, 0]} /><meshStandardMaterial color="#6a6254" roughness={.92} /></mesh>
        <mesh position={[.12, .42, -.08]} rotation={[.15, .1, -.2]}><dodecahedronGeometry args={[.22, 0]} /><meshStandardMaterial color="#817765" roughness={1} /></mesh>
        <Sparkles count={5} scale={.7} size={1.3} speed={.08} color="#b4aa90" />
      </group>}
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
  const pieceColors: Record<GeneralSkill, string> = { wusheng: '#2f8a68', longdan: '#b6cbd0', ganglie: '#a84635', feedback: '#78528d', guicai: '#78528d', jianxiong: '#8c342d', paoxiao: '#8f3529', jizhi: '#c59b43', qicai: '#c59b43', qixi: '#2a8c91', biyue: '#a94f79', zhiheng: '#3c9291', wushuang: '#9d3028' }
  const darkColors: Record<GeneralSkill, string> = { wusheng: '#174d3a', longdan: '#526f78', ganglie: '#61251e', feedback: '#3d294b', guicai: '#3d294b', jianxiong: '#271b23', paoxiao: '#381713', jizhi: '#385f59', qicai: '#385f59', qixi: '#17464b', biyue: '#51233b', zhiheng: '#193f42', wushuang: '#351311' }
  const color = pieceColors[unit.skill], darkColor = darkColors[unit.skill]
  const selectedKind = selectedAsSlash ? 'slash' : state.selectedAsDismantle ? 'dismantle' : state.units.player.hand.find(c => c.id === selectedCardId)?.kind
  const canTarget = team !== 'player' && unit.hp > 0 && !!selectedCardId && !!selectedKind && (
    (selectedKind === 'slash' && canSlash(state, state.units.player, unit)) ||
    selectedKind === 'duel' || selectedKind === 'dismantle' ||
    (selectedKind === 'borrowedSword' && !!unit.equipment.weapon) ||
    selectedKind === 'indulgence' || selectedKind === 'fireAttack' || selectedKind === 'ironChain' ||
    (selectedKind === 'snatch' && (state.units.player.skills.includes('qicai') || combatDistance(state, state.units.player, unit) <= 1))
  )

  useEffect(() => {
    if (unit.animation === 'idle') return
    const timer = window.setTimeout(() => resetAnimation(team), unit.animation === 'move' ? 700 : 480)
    return () => window.clearTimeout(timer)
  }, [unit.animation, resetAnimation, team])

  useFrame(({ clock }, delta) => {
    if (!group.current) return
    group.current.position.lerp(target, Math.min(1, delta * 7))
    const idle = Math.sin(clock.elapsedTime * 2.2 + (team === 'player' ? 0 : team === 'north' ? 1 : team === 'east' ? 2 : 3)) * .035
    group.current.position.y = idle + (unit.animation === 'heal' ? Math.abs(Math.sin(clock.elapsedTime * 10)) * .12 : 0)
    const desiredScale = unit.animation === 'hit' ? .9 + Math.abs(Math.sin(clock.elapsedTime * 25)) * .12 : 1
    group.current.scale.lerp(new THREE.Vector3(desiredScale, desiredScale, desiredScale), delta * 10)
    if (unit.animation === 'attack') group.current.rotation.y = Math.sin(clock.elapsedTime * 18) * .18
    else if (unit.animation === 'hit') group.current.rotation.z = Math.sin(clock.elapsedTime * 34) * .09
    else { group.current.rotation.y *= Math.max(0, 1 - delta * 10); group.current.rotation.z *= Math.max(0, 1 - delta * 10) }
  })

  return (
    <group
      ref={group}
      position={worldPosition(unit.position)}
      onClick={e => {
        e.stopPropagation()
        if (canTarget && selectedCardId) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: team, asSlash: selectedAsSlash, asDismantle: state.selectedAsDismantle, materialIds: state.spearMode ? state.spearSelection : undefined, lordAssist: state.jijiangSource ?? undefined })
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
      {unit.chained && <mesh position-y={.34} rotation-x={Math.PI / 2}>
        <torusGeometry args={[.58, .055, 8, 24]} />
        <meshStandardMaterial color="#80d8dc" emissive="#167782" emissiveIntensity={1.4} metalness={.75} roughness={.25} />
      </mesh>}
      <mesh position-y={.18} castShadow>
        <cylinderGeometry args={[.38, .45, .28, 12]} />
        <meshStandardMaterial color={color} roughness={.34} metalness={.45} />
      </mesh>
      <mesh position-y={.7} castShadow>
        <cylinderGeometry args={[.28, .34, .8, 10]} />
        <meshStandardMaterial color={darkColor} roughness={.55} />
      </mesh>
      <mesh position-y={1.2} castShadow>
        <sphereGeometry args={[.29, 16, 12]} />
        <meshStandardMaterial color="#d6b28a" roughness={.8} />
      </mesh>
      {unit.skill === 'wusheng' && <>
        <mesh position={[0, 1.43, 0]} rotation-z={-.14}><capsuleGeometry args={[.24, .2, 4, 8]} /><meshStandardMaterial color="#285942" roughness={.65} /></mesh>
        <mesh position={[0, 1.02, .24]} rotation-x={-.12}><coneGeometry args={[.15, .72, 7]} /><meshStandardMaterial color="#201714" roughness={1} /></mesh>
        <group position={[.43, .75, 0]} rotation-z={-.18}>
          <mesh position-y={.25}><cylinderGeometry args={[.027, .027, 1.8, 7]} /><meshStandardMaterial color="#6a3d20" roughness={.7} /></mesh>
          <mesh position={[0, 1.15, 0]} rotation-z={-.36}><boxGeometry args={[.15, .7, .06]} /><meshStandardMaterial color="#a9c6bd" metalness={.9} roughness={.18} /></mesh>
          <mesh position={[0, .82, 0]}><torusGeometry args={[.11, .027, 6, 14]} /><meshStandardMaterial color="#d9ae52" metalness={.75} /></mesh>
        </group>
      </>}
      {unit.skill === 'longdan' && <>
        <mesh position={[0, 1.43, 0]}><coneGeometry args={[.28, .34, 8]} /><meshStandardMaterial color="#d5e2df" metalness={.8} roughness={.22} /></mesh>
        <mesh position={[0, 1.7, 0]} rotation-z={-.18}><capsuleGeometry args={[.035, .34, 3, 6]} /><meshStandardMaterial color="#b53831" roughness={.7} /></mesh>
        <group position={[-.42, .82, 0]} rotation-z={.18}>
          <mesh position-y={.3}><cylinderGeometry args={[.024, .024, 1.9, 7]} /><meshStandardMaterial color="#7c5935" /></mesh>
          <mesh position={[0, 1.27, 0]}><coneGeometry args={[.12, .48, 5]} /><meshStandardMaterial color="#d7e5e2" metalness={.95} roughness={.14} /></mesh>
        </group>
      </>}
      {unit.skill === 'ganglie' && <>
        <mesh position={[0, 1.43, 0]}><cylinderGeometry args={[.3, .25, .24, 8]} /><meshStandardMaterial color="#4b2722" metalness={.6} /></mesh>
        <mesh position={[-.12, 1.23, .265]} rotation-z={-.1}><boxGeometry args={[.2, .09, .035]} /><meshStandardMaterial color="#171313" roughness={1} /></mesh>
        {[-.34, .34].map((x, i) => <mesh key={i} position={[x, .91, 0]} rotation-z={x < 0 ? -.35 : .35}><dodecahedronGeometry args={[.2, 0]} /><meshStandardMaterial color="#7d3128" metalness={.5} roughness={.45} /></mesh>)}
        <group position={[-.43, .8, 0]} rotation-z={.23}><mesh position-y={.25}><cylinderGeometry args={[.035, .035, 1.65, 7]} /><meshStandardMaterial color="#4a3021" /></mesh><mesh position={[0, 1.02, 0]}><octahedronGeometry args={[.2]} /><meshStandardMaterial color="#aeb6b0" metalness={.85} /></mesh></group>
      </>}
      {unit.skill === 'feedback' && <>
        <mesh position={[0, 1.48, 0]}><boxGeometry args={[.56, .12, .42]} /><meshStandardMaterial color="#25202b" roughness={.55} /></mesh>
        <mesh position={[0, 1.62, 0]}><boxGeometry args={[.25, .22, .3]} /><meshStandardMaterial color="#33263b" roughness={.7} /></mesh>
        <group position={[-.43, .83, .08]} rotation={[0, 0, .35]}>
          {[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[(i - 2) * .055, .43 + Math.abs(i - 2) * .025, 0]} rotation-z={(i - 2) * -.1}><capsuleGeometry args={[.035, .48, 3, 6]} /><meshStandardMaterial color="#d9d2b8" roughness={.8} /></mesh>)}
          <mesh position={[0, .15, .01]}><boxGeometry args={[.32, .12, .05]} /><meshStandardMaterial color="#6f4c2e" /></mesh>
        </group>
      </>}
      {unit.skill === 'jianxiong' && <>
        <mesh position={[0, 1.48, 0]}><cylinderGeometry args={[.3, .24, .23, 8]} /><meshStandardMaterial color="#171820" metalness={.72} roughness={.32} /></mesh>
        <mesh position={[0, 1.67, 0]}><boxGeometry args={[.18, .26, .26]} /><meshStandardMaterial color="#c09b48" metalness={.9} roughness={.2} /></mesh>
        {[-.34, .34].map(x => <mesh key={x} position={[x, .91, 0]} rotation-z={x < 0 ? -.32 : .32}><boxGeometry args={[.25, .45, .3]} /><meshStandardMaterial color="#7c2b28" metalness={.65} roughness={.38} /></mesh>)}
        <group position={[.46, .82, 0]} rotation-z={-.26}><mesh position-y={.27}><cylinderGeometry args={[.035, .035, 1.45, 7]} /><meshStandardMaterial color="#4d301d" /></mesh><mesh position={[0, 1.02, 0]}><boxGeometry args={[.15, .68, .065]} /><meshStandardMaterial color="#d0c9ae" metalness={.95} /></mesh><mesh position={[0, .62, 0]}><boxGeometry args={[.26, .1, .08]} /><meshStandardMaterial color="#c39b43" metalness={.8} /></mesh></group>
      </>}
      {unit.skill === 'paoxiao' && <>
        <mesh position={[0, 1.43, 0]}><torusGeometry args={[.24, .11, 6, 9, Math.PI]} /><meshStandardMaterial color="#1c1512" roughness={1} /></mesh>
        <mesh position={[0, 1.02, .24]}><coneGeometry args={[.24, .62, 8]} /><meshStandardMaterial color="#17100e" roughness={1} /></mesh>
        {[-.34, .34].map((x, i) => <mesh key={i} position={[x, .92, 0]}><dodecahedronGeometry args={[.22, 0]} /><meshStandardMaterial color="#713127" metalness={.7} /></mesh>)}
        <group position={[.46, .82, 0]} rotation-z={-.2}><mesh position-y={.3}><cylinderGeometry args={[.025, .025, 2, 7]} /><meshStandardMaterial color="#37261a" /></mesh><mesh position={[0, 1.34, 0]}><coneGeometry args={[.13, .5, 5]} /><meshStandardMaterial color="#b4b8b2" metalness={.9} /></mesh></group>
      </>}
      {unit.skill === 'jizhi' && <>
        <mesh position={[0, 1.48, 0]}><torusGeometry args={[.25, .035, 7, 16]} /><meshStandardMaterial color="#c89b43" metalness={.8} /></mesh>
        <group position={[-.43, .84, .08]} rotation={[0, 0, .35]}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[(i - 2) * .055, .43, 0]} rotation-z={(i - 2) * -.11}><capsuleGeometry args={[.035, .48, 3, 6]} /><meshStandardMaterial color="#d9d2b8" /></mesh>)}</group>
        <mesh position={[.34, 1.28, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[.13, .025, 6, 14]} /><meshStandardMaterial color="#d6a94a" metalness={.9} emissive="#76520c" emissiveIntensity={.5} /></mesh>
      </>}
      {unit.skill === 'qixi' && <>
        {[[-.31, 1.02], [.31, 1.02], [-.22, .78]].map(([x, y], i) => <mesh key={i} position={[x, y, .22]}><sphereGeometry args={[.08, 10, 8]} /><meshStandardMaterial color="#d5a847" metalness={.85} emissive="#71510d" emissiveIntensity={.35} /></mesh>)}
        <group position={[.45, .86, 0]} rotation-z={-.48}><mesh position-y={.28}><cylinderGeometry args={[.035, .035, 1.45, 7]} /><meshStandardMaterial color="#45291b" /></mesh><mesh position={[0, 1.02, 0]} rotation-z={-.25}><boxGeometry args={[.16, .75, .055]} /><meshStandardMaterial color="#aeb8b8" metalness={.95} /></mesh></group>
      </>}
      {unit.skill === 'biyue' && <>
        <mesh position={[0, 1.48, 0]}><torusGeometry args={[.26, .035, 7, 16, Math.PI]} /><meshStandardMaterial color="#d9b8c8" metalness={.7} /></mesh>
        {[-.2, .2].map((x, i) => <mesh key={i} position={[x, 1.55, 0]}><sphereGeometry args={[.075, 10, 8]} /><meshStandardMaterial color="#b73e62" emissive="#65162c" emissiveIntensity={.5} /></mesh>)}
        <group position={[-.42, .86, .08]} rotation-z={.38}><mesh position-y={.45}><boxGeometry args={[.32, .82, .055]} /><meshStandardMaterial color="#7f354f" roughness={.6} /></mesh></group>
      </>}
      {unit.skill === 'zhiheng' && <>
        <mesh position={[0, 1.5, 0]}><boxGeometry args={[.48, .18, .34]} /><meshStandardMaterial color="#b99646" metalness={.8} /></mesh>
        <mesh position={[0, 1.66, 0]}><sphereGeometry args={[.1, 10, 8]} /><meshStandardMaterial color="#5fbaa4" emissive="#1b6559" emissiveIntensity={.6} /></mesh>
        <group position={[.45, .82, 0]} rotation-z={-.32}><mesh position-y={.26}><cylinderGeometry args={[.03, .03, 1.55, 7]} /><meshStandardMaterial color="#5b3922" /></mesh><mesh position={[0, 1.05, 0]}><boxGeometry args={[.13, .68, .055]} /><meshStandardMaterial color="#d0d7cf" metalness={.95} /></mesh></group>
      </>}
      {unit.skill === 'wushuang' && <>
        {[-.16, .16].map((x, i) => <mesh key={i} position={[x, 1.76, 0]} rotation-z={x < 0 ? -.14 : .14}><capsuleGeometry args={[.028, .62, 3, 6]} /><meshStandardMaterial color="#a22d27" roughness={.7} /></mesh>)}
        <mesh position={[0, 1.46, 0]}><coneGeometry args={[.3, .3, 6]} /><meshStandardMaterial color="#251719" metalness={.7} /></mesh>
        <group position={[-.48, .82, 0]} rotation-z={.22}><mesh position-y={.3}><cylinderGeometry args={[.035, .035, 1.9, 7]} /><meshStandardMaterial color="#251817" /></mesh><mesh position={[0, 1.3, 0]}><boxGeometry args={[.25, .68, .07]} /><meshStandardMaterial color="#b9b7ad" metalness={.95} /></mesh></group>
      </>}
      <mesh position={[0, .78, .18]} rotation-x={-.18}>
        <planeGeometry args={[.62, .88]} />
        <meshStandardMaterial color={darkColor} side={THREE.DoubleSide} roughness={.9} />
      </mesh>
      {unit.animation === 'heal' && <Sparkles count={28} scale={1.35} size={4} speed={1} color="#78e89b" position-y={.7} />}
      {unit.animation === 'attack' && <Sparkles count={22} scale={1.25} size={3.5} speed={1.5} color="#ffb347" position-y={.75} />}
      {unit.animation === 'hit' && <Sparkles count={18} scale={1.15} size={3.2} speed={1.8} color="#ff5549" position-y={.7} />}
      {unit.animation === 'cast' && <Sparkles count={24} scale={1.3} size={3.3} speed={1.1} color="#69d9e8" position-y={.8} />}
      {unit.judgement.map((card, index) => <group key={card.id} position={[-.34 + index * .28, 1.95, 0]}>
        <mesh><boxGeometry args={[.22, .3, .035]} /><meshStandardMaterial color={card.kind === 'lightning' ? '#33285e' : '#8b6531'} emissive={card.kind === 'lightning' ? '#4f35a3' : '#70410f'} emissiveIntensity={.85} /></mesh>
        <mesh position-z={.022}><ringGeometry args={[.045, .065, 12]} /><meshBasicMaterial color={card.kind === 'lightning' ? '#b9a8ff' : '#ffd57b'} /></mesh>
        <Sparkles count={5} scale={.35} size={1.5} speed={.35} color={card.kind === 'lightning' ? '#b9a8ff' : '#ffd57b'} />
      </group>)}
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
          <UnitPiece team="north" />
          <UnitPiece team="east" />
          <UnitPiece team="west" />
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
  const portraits: Record<GeneralSkill, string> = { wusheng: '/heroes/guan-yun.png', longdan: '/heroes/zhao-ling.png', ganglie: '/heroes/xiahou-lie.png', feedback: '/heroes/sima-xuan.png', guicai: '/heroes/sima-xuan.png', jianxiong: '/heroes/cao-cao.png', paoxiao: '/heroes/zhang-fei.png', jizhi: '/heroes/huang-yueying.png', qicai: '/heroes/huang-yueying.png', qixi: '/heroes/gan-ning.png', biyue: '/heroes/diao-chan.png', zhiheng: '/heroes/sun-quan.png', wushuang: '/heroes/lu-bu.png' }
  const skillCopy = { wusheng: '武圣 · 红牌可当杀', longdan: '龙胆 · 杀闪互化', ganglie: '刚烈 · 受伤后判定反击', feedback: '反馈/鬼才 · 受伤获牌/改判', jianxiong: '奸雄 · 受伤后获得伤害牌', paoxiao: '咆哮 · 出杀无次数限制', jizhi: '集智/奇才 · 摸牌/锦囊无距离', qixi: '奇袭 · 黑牌可当过河拆桥', biyue: '闭月 · 回合结束摸一张牌', zhiheng: '制衡 · 每回合换任意手牌', wushuang: '无双 · 杀与决斗需双响应', guicai: '鬼才 · 使用手牌修改判定', qicai: '奇才 · 锦囊无距离限制' } as const
  const factionLabel: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }
  const lordSkill = unit.identity === 'lord' ? unit.faction === 'shu' ? ' · 激将' : unit.faction === 'wei' ? ' · 护驾' : '' : ''
  return (
    <section className={`status ${team}`}>
      <div className="avatar"><img src={portraits[unit.skill]} alt="" /><span>{team === 'player' ? '主' : unit.revealed ? IDENTITY_LABEL[unit.identity].slice(0, 1) : '?'}</span></div>
      <div className="status-copy">
        <div className="name-row"><strong>{unit.name}</strong><span>{factionLabel[unit.faction]} · {team === 'player' || unit.revealed ? IDENTITY_LABEL[unit.identity] : '身份未知'}</span></div>
        <Hearts hp={unit.hp} max={unit.maxHp} />
        <div className="status-meta"><span>手牌 {unit.hand.length}</span><span>据点 {score}/3</span>{unit.chained && <span>⛓ 连环</span>}</div>
        <div className="equipment-line">{unit.equipment.weapon ? CARD_LABEL[unit.equipment.weapon.kind] : '无武器'} · {unit.equipment.armor ? CARD_LABEL[unit.equipment.armor.kind] : '无防具'}{unit.equipment.offensiveMount ? ` · ${CARD_LABEL[unit.equipment.offensiveMount.kind]}` : ''}{unit.equipment.defensiveMount ? ` · ${CARD_LABEL[unit.equipment.defensiveMount.kind]}` : ''}{unit.judgement.length ? ` · 判定 ${unit.judgement.map(c => CARD_LABEL[c.kind]).join('/')}` : ''}</div>
        <div className="skill-line">{skillCopy[unit.skill]}{lordSkill}</div>
      </div>
    </section>
  )
}

function CardView({ card, selected }: { card: Card; selected: boolean }) {
  const selectCard = useGameStore(s => s.selectCard)
  const toggleDiscard = useGameStore(s => s.toggleDiscard)
  const state = useGameStore()
  const discarding = state.phase === 'player' && state.turnStage === 'discard'
  const disabled = !discarding && (state.phase !== 'player' || (card.kind === 'peach' && state.units.player.hp >= state.units.player.maxHp) || (card.kind === 'slash' && state.units.player.attacksUsed >= slashLimit(state.units.player)) || (card.kind === 'wine' && state.units.player.wineUsed))
  const red = card.suit === 'heart' || card.suit === 'diamond'
  return (
    <button className={`card ${card.kind} ${selected ? 'selected' : ''} ${discarding ? 'discarding' : ''}`} disabled={disabled} onClick={() => discarding ? toggleDiscard(card.id) : selectCard(card.id)}>
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
      <div><b>01</b><strong>身份</strong><p>你是主公。找出反贼与内奸；误杀忠臣会失去所有牌。</p></div>
      <div><b>02</b><strong>战棋</strong><p>水域耗 2 移动力；森林提供掩护；山脊增加射程。靠近军需箱后，选一张手牌再点箱子，可弃一摸二。</p></div>
      <div><b>03</b><strong>牌局</strong><p>击杀反贼摸三张；忠臣可发动护驾；遭遇杀与群体锦囊时亲自响应。</p></div>
    </div>
    <button className="primary" onClick={close}>进入战场</button>
  </section></div>
}

const GENERAL_OPTIONS: { skill: GeneralSkill; name: string; title: string; faction: string; portrait: string; skillName: string; copy: string }[] = [
  { skill: 'wusheng', name: '关羽', title: '美髯公', faction: '蜀', portrait: '/heroes/guan-yun.png', skillName: '武圣', copy: '红色牌可以当【杀】使用。' },
  { skill: 'longdan', name: '赵云', title: '少年将军', faction: '蜀', portrait: '/heroes/zhao-ling.png', skillName: '龙胆', copy: '【杀】与【闪】可以相互转化。' },
  { skill: 'ganglie', name: '夏侯惇', title: '独眼的罗刹', faction: '魏', portrait: '/heroes/xiahou-lie.png', skillName: '刚烈', copy: '受伤后判定，反击伤害来源。' },
  { skill: 'feedback', name: '司马懿', title: '狼顾之鬼', faction: '魏', portrait: '/heroes/sima-xuan.png', skillName: '反馈 · 鬼才', copy: '受伤后获得来源牌；不利判定时自动用手牌改判。' },
  { skill: 'jianxiong', name: '曹操', title: '魏武帝', faction: '魏', portrait: '/heroes/cao-cao.png', skillName: '奸雄 · 护驾', copy: '受到伤害后获得造成伤害的牌；魏势力忠臣可替你出闪。' },
  { skill: 'paoxiao', name: '张飞', title: '万夫不当', faction: '蜀', portrait: '/heroes/zhang-fei.png', skillName: '咆哮', copy: '出牌阶段使用【杀】没有次数限制。' },
  { skill: 'jizhi', name: '黄月英', title: '归隐的杰女', faction: '蜀', portrait: '/heroes/huang-yueying.png', skillName: '集智 · 奇才', copy: '普通锦囊摸一张；锦囊牌无距离限制。' },
  { skill: 'qixi', name: '甘宁', title: '锦帆游侠', faction: '吴', portrait: '/heroes/gan-ning.png', skillName: '奇袭', copy: '黑色牌可以当【过河拆桥】使用。' },
  { skill: 'biyue', name: '貂蝉', title: '绝世的舞姬', faction: '群', portrait: '/heroes/diao-chan.png', skillName: '闭月', copy: '结束阶段摸一张牌。' },
  { skill: 'zhiheng', name: '孙权', title: '年轻的贤君', faction: '吴', portrait: '/heroes/sun-quan.png', skillName: '制衡', copy: '每回合一次，弃置任意张手牌并等量摸牌。' },
  { skill: 'wushuang', name: '吕布', title: '武的化身', faction: '群', portrait: '/heroes/lu-bu.png', skillName: '无双', copy: '杀与决斗要求对方连续打出两张响应牌。' },
]

function GeneralSelect() {
  const selectGeneral = useGameStore(s => s.selectGeneral)
  return <div className="overlay general-select-overlay"><section className="general-select panel">
    <span className="eyebrow">主公选将</span>
    <h1>选择本局武将</h1>
    <div className="general-grid">
      {GENERAL_OPTIONS.map(option => <button key={option.skill} className={`general-option ${option.skill}`} onClick={() => selectGeneral(option.skill)}>
        <img src={option.portrait} alt={`${option.name}武将原画`} />
        <span className="faction">{option.faction}</span>
        <div><strong>{option.name}</strong><small>{option.title}</small><b>{option.skillName}</b><p>{option.copy}</p></div>
      </button>)}
    </div>
  </section></div>
}

function ResponseWindow() {
  const pending = useGameStore(s => s.pendingResponse)
  const player = useGameStore(s => s.units.player)
  const respond = useGameStore(s => s.respond)
  if (!pending) return null
  const responses = player.hand.filter(card => card.kind === pending.required || (player.skill === 'longdan' && ((pending.required === 'dodge' && card.kind === 'slash') || (pending.required === 'slash' && card.kind === 'dodge'))))
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">响应时机</span>
    <h1>{pending.prompt}</h1>
    <p>选择一张【{CARD_LABEL[pending.required]}】打出{(pending.requiredCount ?? 1) > 1 ? `（还需 ${pending.requiredCount} 张）` : ''}，或放弃响应并承受效果。</p>
    <div className="response-cards">
      {responses.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => respond(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{card.kind === pending.required ? '打出响应' : `龙胆 → ${CARD_LABEL[pending.required]}`}</small>
      </button>)}
      {!responses.length && <span className="no-response">手牌中没有【{CARD_LABEL[pending.required]}】</span>}
    </div>
    <button className="decline-response" onClick={() => respond(null)}>放弃响应</button>
  </section></div>
}

function BattleReport({ close }: { close: () => void }) {
  const state = useGameStore()
  return <div className="overlay report-overlay"><section className="battle-report panel">
    <button className="icon-button close" onClick={close} aria-label="关闭战报"><X /></button>
    <span className="eyebrow">战局记录</span>
    <h1>战报</h1>
    <div className="pile-summary">
      <div><strong>{state.deck.length}</strong><span>牌堆</span></div>
      <div><strong>{state.discard.length}</strong><span>弃牌堆</span></div>
      <div><strong>{Object.values(state.units).filter(unit => unit.hp > 0).length}</strong><span>存活武将</span></div>
      <div><strong>{state.turn}</strong><span>当前轮次</span></div>
    </div>
    <ol className="history-list">{state.history.map((entry, index) => <li key={`${entry}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{entry}</span></li>)}</ol>
  </section></div>
}

function App() {
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const [sound, setSound] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [tutorial, setTutorial] = useState(() => localStorage.getItem('wargrid-tutorial') !== 'seen')
  const selectedCard = state.units.player.hand.find(c => c.id === state.selectedCardId)
  const canWusheng = state.units.player.skill === 'wusheng' && selectedCard && selectedCard.kind !== 'slash' && (selectedCard.suit === 'heart' || selectedCard.suit === 'diamond')
  const canSpear = state.units.player.equipment.weapon?.kind === 'spear' && state.units.player.hand.length >= 2 && state.units.player.attacksUsed < 1
  const canJijiang = state.units.player.identity === 'lord' && state.units.player.faction === 'shu' && state.units.player.attacksUsed < slashLimit(state.units.player) && Object.values(state.units).some(unit => unit.identity === 'loyalist' && unit.faction === 'shu' && unit.hp > 0 && (unit.hand.some(card => card.kind === 'slash') || (unit.skill === 'longdan' && unit.hand.some(card => card.kind === 'dodge'))))
  const canQixi = state.units.player.skill === 'qixi' && selectedCard && (selectedCard.suit === 'spade' || selectedCard.suit === 'club')
  const canZhiheng = state.units.player.skill === 'zhiheng' && !state.units.player.skillUsed
  const currentName = state.units[state.currentUnit]?.name
  const discardRequired = Math.max(0, state.units.player.hand.length - state.units.player.hp)
  const discardReady = state.turnStage !== 'discard' || state.discardSelection.length === discardRequired
  const closeTutorial = () => { localStorage.setItem('wargrid-tutorial', 'seen'); setTutorial(false) }

  useEffect(() => {
    const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => document.removeEventListener('touchmove', prevent)
  }, [])

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">W</span><div><strong>WARGRID</strong><small>第 {state.turn} 回合</small></div></div>
      <div className={`turn-indicator ${state.phase}`}><span />{state.phase === 'player' ? '你的回合' : state.phase === 'ai' ? `${currentName}行动` : '战局结束'}</div>
      <div className="header-actions">
        <button className="icon-button" onClick={() => setShowHistory(true)} aria-label="查看战报"><ScrollText /></button>
        <button className="icon-button" onClick={() => setTutorial(true)} aria-label="查看规则"><CircleHelp /></button>
        <button className="icon-button" onClick={() => setSound(v => !v)} aria-label="切换音效">{sound ? <Volume2 /> : <VolumeX />}</button>
        <button className="icon-button" onClick={() => dispatch({ type: 'RESTART' })} aria-label="重新开始"><RotateCcw /></button>
      </div>
    </header>

    <aside className="status-left"><PlayerStatus team="player" /></aside>
    <aside className="ai-roster"><PlayerStatus team="north" /><PlayerStatus team="east" /><PlayerStatus team="west" /></aside>
    <div className="battlefield"><Battlefield /></div>

    <div className="message-bar"><span className="message-pip" />{state.message}</div>

    <footer className="command-deck">
      <div className="movement"><span>{state.turnStage === 'play' ? '出牌阶段' : state.turnStage === 'discard' ? `弃牌 ${state.discardSelection.length}/${discardRequired}` : state.turnStage}</span><div>{[1, 2, 3].map(n => <i key={n} className={state.turnStage === 'play' && n <= state.units.player.movement ? 'active' : ''} />)}</div></div>
      <div className="hand" aria-label="你的手牌">
        {state.units.player.hand.map(card => <CardView key={card.id} card={card} selected={state.turnStage === 'discard' ? state.discardSelection.includes(card.id) : state.zhihengMode ? state.zhihengSelection.includes(card.id) : state.spearMode ? state.spearSelection.includes(card.id) : selectedCard?.id === card.id} />)}
        {!state.units.player.hand.length && <span className="empty-hand">暂无手牌</span>}
      </div>
      <div className="turn-actions">
        {state.turnStage === 'play' && canWusheng && <button className={`secondary skill-action ${state.selectedAsSlash ? 'active' : ''}`} onClick={() => state.activateWusheng()}><Swords />武圣</button>}
        {state.turnStage === 'play' && canSpear && <button className={`secondary skill-action ${state.spearMode ? 'active' : ''}`} onClick={() => state.activateSpear()}><Swords />丈八</button>}
        {state.turnStage === 'play' && canJijiang && <button className={`secondary skill-action ${state.jijiangSource ? 'active' : ''}`} onClick={() => state.activateJijiang()}><Swords />激将</button>}
        {state.turnStage === 'play' && canQixi && <button className={`secondary skill-action ${state.selectedAsDismantle ? 'active' : ''}`} onClick={() => state.activateQixi()}><Swords />奇袭</button>}
        {state.turnStage === 'play' && canZhiheng && <button className={`secondary skill-action ${state.zhihengMode ? 'active' : ''}`} onClick={() => state.activateZhiheng()}><Swords />{state.zhihengMode && state.zhihengSelection.length ? `制衡${state.zhihengSelection.length}` : '制衡'}</button>}
        {state.turnStage === 'play' && state.selectedCardId && <button className="secondary" onClick={() => state.selectCard(null)}><X />取消</button>}
        <button className="end-turn" disabled={state.phase !== 'player' || !discardReady} onClick={() => dispatch({ type: 'END_TURN' })}><SkipForward />{state.turnStage === 'discard' ? '确认弃牌' : '结束回合'}</button>
      </div>
    </footer>

    {!state.generalSelected && <GeneralSelect />}
    {state.generalSelected && tutorial && <Tutorial close={closeTutorial} />}
    {state.generalSelected && !tutorial && state.pendingResponse && <ResponseWindow />}
    {state.generalSelected && showHistory && <BattleReport close={() => setShowHistory(false)} />}
    {state.winner && <div className="overlay"><section className={`result panel ${state.winner}`}>
      <span className="eyebrow">战局结束</span>
      <div className="result-seal">{state.winner === 'player' ? '胜' : '败'}</div>
      <h1>{state.winner === 'player' ? '主忠阵营平定乱局' : state.units[state.winner].identity === 'renegade' ? '内奸成为最后赢家' : '反贼推翻了主公'}</h1>
      <p>历经 {state.turn} 轮 · 获胜身份：{IDENTITY_LABEL[state.units[state.winner].identity]}</p>
      <button className="primary" onClick={() => dispatch({ type: 'RESTART' })}><RotateCcw />再战一局</button>
    </section></div>}

    <div className="portrait-warning"><RotateCcw /><strong>请横屏游玩</strong><span>旋转设备以展开完整战场</span></div>
  </main>
}

export default App
