import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei'
import { CircleHelp, RotateCcw, ScrollText, SkipForward, Swords, Volume2, VolumeX, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore, isCellReachable } from './game/store'
import { CARD_COPY, CARD_LABEL, IDENTITY_LABEL, SUIT_GLYPH, type Card, type Faction, type GeneralSkill, type Position, type Team, type Unit } from './types'
import { canBorrowedSwordTarget, canSlash, combatDistance, effectiveAttackRange, isSlashKind, pathDistance, samePosition, slashLimit, terrainAt } from './game/rules'

const TILE_GAP = 1.06
const worldPosition = (p: Position): [number, number, number] => [(p.x - 4) * TILE_GAP, 0, (p.y - 4) * TILE_GAP]

function WaterSurface({ seed }: { seed: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const wave = Math.sin(clock.elapsedTime * 1.35 + seed * .73)
    if (mesh.current) mesh.current.position.y = wave * .015
    if (material.current) material.current.opacity = .38 + wave * .07
  })
  return <mesh ref={mesh} rotation-x={-Math.PI / 2}>
    <planeGeometry args={[.82, .82, 3, 3]} />
    <meshStandardMaterial ref={material} color="#2b7290" transparent opacity={.42} roughness={.15} metalness={.15} />
  </mesh>
}

function BattleLighting() {
  const turn = useGameStore(state => state.turn)
  const ambient = useRef<THREE.AmbientLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const tones = ['#ffd7a0', '#e1fff8', '#e89a73']
  const target = useMemo(() => new THREE.Color(tones[(turn - 1) % tones.length]), [turn])
  useFrame(({ clock }, delta) => {
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(ambient.current.intensity, turn % 3 === 0 ? 1.3 : 1.65, delta * .45)
    if (sun.current) {
      sun.current.color.lerp(target, Math.min(1, delta * .38))
      sun.current.position.x = 4 + Math.sin(clock.elapsedTime * .08) * .7
    }
  })
  return <>
    <ambientLight ref={ambient} intensity={1.65} />
    <hemisphereLight args={['#bfe3df', '#251b18', 1.25]} />
    <directionalLight ref={sun} position={[4, 9, 5]} intensity={2.8} color={tones[(turn - 1) % tones.length]} castShadow shadow-mapSize={[1024, 1024]} />
  </>
}

function ControlBeacon({ owner }: { owner: Team | null }) {
  const ring = useRef<THREE.Mesh>(null)
  const beam = useRef<THREE.Mesh>(null)
  const colors: Record<Team, string> = { player: '#55c7ff', north: '#ef5350', east: '#ae72e8', west: '#ef9b43' }
  const color = owner ? colors[owner] : '#f2c66d'
  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.25) * .09
    if (ring.current) ring.current.scale.setScalar(pulse)
    if (beam.current) beam.current.scale.y = .82 + Math.sin(clock.elapsedTime * 1.7) * .18
  })
  return <group position-y={.12}>
    <mesh ref={ring} rotation-x={-Math.PI / 2}>
      <torusGeometry args={[.3, .042, 8, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.45} />
    </mesh>
    <mesh ref={beam} position-y={.36}>
      <cylinderGeometry args={[.12, .24, .72, 18, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={owner ? .18 : .09} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <pointLight position-y={.3} color={color} intensity={owner ? 2.2 : 1.1} distance={2.2} />
    <Sparkles count={owner ? 20 : 12} scale={.82} size={2.2} speed={owner ? .48 : .3} color={color} />
  </group>
}

function Tile({ position }: { position: Position }) {
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const hoverCell = useGameStore(s => s.hoverCell)
  const reachable = isCellReachable(state.reachable, position)
  const inPath = isCellReachable(state.pathPreview, position)
  const control = samePosition(state.controlPoint, position)
  const occupant = Object.values(state.units).find(u => u.hp > 0 && samePosition(u.position, position))
  const occupied = !!occupant
  const obstacle = state.obstacles.some(o => samePosition(o, position))
  const terrain = terrainAt(state, position)
  const mapObject = state.mapObjects.find(item => samePosition(item.position, position))
  const selectedCard = state.units.player.hand.find(card => card.id === state.selectedCardId)
  const previewingSlash = !!selectedCard && (isSlashKind(selectedCard.kind) || state.selectedAsSlash) && state.phase === 'player' && state.turnStage === 'play'
  const attackPreview = previewingSlash && !samePosition(state.units.player.position, position) && pathDistance(state, state.units.player.position, position, 'player') <= effectiveAttackRange(state, state.units.player)
  const canInteract = !!mapObject && !mapObject.claimed && !!selectedCard && state.phase === 'player' && state.currentUnit === 'player' && state.turnStage === 'play' && Math.abs(state.units.player.position.x - position.x) + Math.abs(state.units.player.position.y - position.y) <= 1
  const [hovered, setHovered] = useState(false)
  const terrainColor = terrain === 'water' ? '#173e51' : terrain === 'bridge' ? '#554631' : terrain === 'marsh' ? '#313f2b' : terrain === 'forest' ? '#193b2d' : terrain === 'ridge' ? '#3c3831' : terrain === 'road' ? '#3b352b' : terrain === 'camp' ? '#493328' : terrain === 'village' ? '#544231' : terrain === 'watchtower' ? '#4c402c' : state.mapId === 'siege' ? ((position.x + position.y) % 2 ? '#283a3a' : '#304144') : state.mapId === 'highland' ? ((position.x + position.y) % 2 ? '#2d3b2c' : '#354432') : state.mapId === 'wetland' ? ((position.x + position.y) % 2 ? '#273a35' : '#30443a') : ((position.x + position.y) % 2 ? '#132c32' : '#17363d')
  const controlColors: Record<Team, string> = { player: '#235e79', north: '#763a32', east: '#5c4177', west: '#76502c' }
  const color = obstacle ? state.mapId === 'highland' ? '#46503d' : '#453f36' : control ? occupant ? controlColors[occupant.team] : '#8c652c' : inPath ? '#53bfd1' : attackPreview ? '#633b35' : reachable ? '#234e5c' : terrainColor

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
      {control && !obstacle && <ControlBeacon owner={occupant?.team ?? null} />}
      {attackPreview && !obstacle && <mesh position-y={.085} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.34, .43, 24]} />
        <meshBasicMaterial color="#ff725f" transparent opacity={.7} side={THREE.DoubleSide} />
      </mesh>}
      {mapObject && <group position={[.24, .15, -.22]} rotation-y={-.18} onPointerEnter={() => { if (canInteract) document.body.style.cursor = 'pointer' }} onPointerLeave={() => { document.body.style.cursor = 'default' }} onClick={e => { e.stopPropagation(); if (canInteract && selectedCard) dispatch({ type: 'INTERACT', unit: 'player', objectId: mapObject.id, cardId: selectedCard.id }) }}>
        {mapObject.kind === 'supplyCache' && <>
          <mesh position-y={.14}><boxGeometry args={[.4, .25, .32]} /><meshStandardMaterial color={mapObject.claimed ? '#514a3d' : '#8b5528'} roughness={.72} /></mesh>
          <mesh position={[0, mapObject.claimed ? .32 : .29, mapObject.claimed ? -.13 : 0]} rotation-x={mapObject.claimed ? -1.1 : 0}><boxGeometry args={[.4, .1, .32]} /><meshStandardMaterial color={mapObject.claimed ? '#4c463c' : '#aa6e32'} roughness={.65} /></mesh>
          {[-.13, .13].map(x => <mesh key={x} position={[x, .17, .002]}><boxGeometry args={[.035, .34, .34]} /><meshStandardMaterial color="#c3a45a" metalness={.65} roughness={.3} /></mesh>)}
        </>}
        {mapObject.kind === 'healingShrine' && <>
          <mesh position-y={.2}><cylinderGeometry args={[.25, .32, .4, 6]} /><meshStandardMaterial color={mapObject.claimed ? '#4b5148' : '#63866a'} roughness={.7} /></mesh>
          <mesh position-y={.48}><sphereGeometry args={[.13, 10, 8]} /><meshStandardMaterial color={mapObject.claimed ? '#687069' : '#8de0a0'} emissive={mapObject.claimed ? '#000' : '#286e3b'} emissiveIntensity={.9} /></mesh>
          <mesh position={[0, .5, .14]}><boxGeometry args={[.05, .22, .035]} /><meshStandardMaterial color="#e8f1d7" /></mesh><mesh position={[0, .5, .14]}><boxGeometry args={[.2, .05, .035]} /><meshStandardMaterial color="#e8f1d7" /></mesh>
        </>}
        {mapObject.kind === 'warDrum' && <>
          <mesh position-y={.27} rotation-z={Math.PI / 2}><cylinderGeometry args={[.25, .25, .36, 14]} /><meshStandardMaterial color={mapObject.claimed ? '#554640' : '#9a3d31'} roughness={.6} /></mesh>
          {[-.2, .2].map(x => <mesh key={x} position={[x, .27, 0]} rotation-z={Math.PI / 2}><torusGeometry args={[.25, .025, 6, 14]} /><meshStandardMaterial color="#c5a04f" metalness={.7} /></mesh>)}
          <mesh position={[0, .46, .18]} rotation-z={-.5}><cylinderGeometry args={[.018, .025, .55, 6]} /><meshStandardMaterial color="#684425" /></mesh>
        </>}
        {mapObject.kind === 'scoutBeacon' && <>
          <mesh position-y={.22}><cylinderGeometry args={[.14, .22, .44, 6]} /><meshStandardMaterial color={mapObject.claimed ? '#514a41' : '#7c6041'} roughness={.82} /></mesh>
          <mesh position-y={.5}><cylinderGeometry args={[.035, .045, .42, 7]} /><meshStandardMaterial color="#87683f" roughness={.7} /></mesh>
          <mesh position={[0, .75, 0]}><octahedronGeometry args={[.16, 0]} /><meshStandardMaterial color={mapObject.claimed ? '#62594e' : '#ff8540'} emissive={mapObject.claimed ? '#000' : '#c93416'} emissiveIntensity={1.8} /></mesh>
          {!mapObject.claimed && <pointLight position-y={.75} color="#ff7038" intensity={2.4} distance={1.8} />}
        </>}
        {!mapObject.claimed && <><Sparkles count={8} scale={.65} size={2} speed={.35} color={canInteract ? '#fff0a8' : '#dbbc72'} /><mesh position-y={.04} rotation-x={-Math.PI / 2}><ringGeometry args={[.3, .38, 24]} /><meshBasicMaterial color={canInteract ? '#ffe080' : '#9d7440'} transparent opacity={canInteract ? .9 : .45} side={THREE.DoubleSide} /></mesh></>}
      </group>}
      {terrain === 'forest' && !obstacle && <group position={[-.16, .13, .08]}><mesh position-y={.23}><cylinderGeometry args={[.05, .08, .4, 6]} /><meshStandardMaterial color="#5f4530" /></mesh><mesh position-y={.54}><coneGeometry args={[.25, .56, 7]} /><meshStandardMaterial color="#28553a" /></mesh></group>}
      {terrain === 'road' && !control && <group position-y={.09}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.46, .92]} /><meshStandardMaterial color="#65543d" roughness={1} /></mesh>
        {[-.25, .02, .28].map((z, i) => <mesh key={i} position={[i % 2 ? .11 : -.09, .012, z]} rotation-x={-Math.PI / 2}><boxGeometry args={[.22, .012, .06]} /><meshStandardMaterial color="#8a7658" roughness={1} /></mesh>)}
      </group>}
      {terrain === 'water' && <group position-y={.09}>
        <WaterSurface seed={position.x + position.y * 9} />
        {[-.2, .08, .27].map((z, i) => <mesh key={i} position={[i % 2 ? .14 : -.13, .018, z]} rotation-x={-Math.PI / 2}><torusGeometry args={[.12, .012, 4, 16, Math.PI]} /><meshBasicMaterial color="#78bdd0" transparent opacity={.5} /></mesh>)}
      </group>}
      {terrain === 'bridge' && <group position-y={.11}>
        {[-.34, -.17, 0, .17, .34].map((x, index) => <mesh key={x} position={[x, .025, 0]}><boxGeometry args={[.14, .07, .9]} /><meshStandardMaterial color={index % 2 ? '#8a6740' : '#9b7549'} roughness={.88} /></mesh>)}
        {[-.38, .38].map(x => <mesh key={x} position={[x, .08, 0]}><boxGeometry args={[.05, .08, .96]} /><meshStandardMaterial color="#5c4028" roughness={.78} /></mesh>)}
      </group>}
      {terrain === 'marsh' && <group position-y={.09}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.82, .82]} /><meshStandardMaterial color="#56633b" transparent opacity={.55} roughness={.8} /></mesh>
        {[[-.24, -.16], [.18, .12], [-.05, .3]].map(([x, z], i) => <group key={i} position={[x, .04, z]}><mesh position-y={.12}><cylinderGeometry args={[.012, .02, .24, 5]} /><meshStandardMaterial color="#829457" /></mesh><mesh position={[.045, .2, 0]} rotation-z={-.45}><coneGeometry args={[.04, .16, 5]} /><meshStandardMaterial color="#a1ad69" /></mesh></group>)}
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
      {terrain === 'village' && <group position-y={.12}>
        <mesh position={[-.16, .2, .04]}><boxGeometry args={[.48, .36, .42]} /><meshStandardMaterial color="#a58a68" roughness={.95} /></mesh>
        <mesh position={[-.16, .45, .04]} rotation-y={Math.PI / 4}><coneGeometry args={[.4, .3, 4]} /><meshStandardMaterial color="#724239" roughness={.9} /></mesh>
        <mesh position={[-.16, .18, .265]}><boxGeometry args={[.1, .2, .02]} /><meshStandardMaterial color="#3d2c22" /></mesh>
        <mesh position={[.3, .28, -.16]}><cylinderGeometry args={[.025, .035, .56, 6]} /><meshStandardMaterial color="#725137" /></mesh>
        <mesh position={[.42, .48, -.16]}><planeGeometry args={[.26, .18]} /><meshStandardMaterial color="#d8c47d" side={THREE.DoubleSide} /></mesh>
        <Sparkles count={5} scale={.65} size={1.2} speed={.14} color="#9ee5a9" position-y={.35} />
      </group>}
      {terrain === 'watchtower' && !obstacle && <group position-y={.12}>
        {[[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]].map(([x, z], i) => <mesh key={i} position={[x, .3, z]}><cylinderGeometry args={[.035, .055, .62, 6]} /><meshStandardMaterial color="#725034" roughness={.9} /></mesh>)}
        <mesh position-y={.57}><boxGeometry args={[.7, .1, .7]} /><meshStandardMaterial color="#80603b" roughness={.86} /></mesh>
        <mesh position-y={.72} rotation-y={Math.PI / 4}><coneGeometry args={[.58, .32, 4]} /><meshStandardMaterial color="#493228" roughness={.92} /></mesh>
        <mesh position={[0, .98, 0]}><cylinderGeometry args={[.018, .018, .38, 6]} /><meshStandardMaterial color="#d0a95e" metalness={.5} /></mesh>
        <Sparkles count={7} scale={.8} size={1.4} speed={.18} color="#ffda83" position-y={.66} />
      </group>}
      {obstacle && state.mapId === 'siege' && <group position-y={.82}>
        <mesh position-y={.14} castShadow><boxGeometry args={[.88, .82, .88]} /><meshStandardMaterial color="#706b5d" roughness={.96} /></mesh>
        {[-.32, 0, .32].map(x => <mesh key={x} position={[x, .65, -.31]} castShadow><boxGeometry args={[.2, .2, .2]} /><meshStandardMaterial color="#898273" roughness={.92} /></mesh>)}
        {[-.32, .32].map(x => <mesh key={x} position={[x, .65, .31]} castShadow><boxGeometry args={[.2, .2, .2]} /><meshStandardMaterial color="#898273" roughness={.92} /></mesh>)}
      </group>}
      {obstacle && state.mapId === 'highland' && <group position-y={.82} rotation-y={(position.x * 7 + position.y * 3) % 5 * .23}>
        <mesh position-y={.28} castShadow><cylinderGeometry args={[.28, .45, .82, 5]} /><meshStandardMaterial color="#59604f" roughness={1} flatShading /></mesh>
        <mesh position={[.02, .8, -.02]} rotation-z={.13} castShadow><coneGeometry args={[.34, .65, 5]} /><meshStandardMaterial color="#777867" roughness={.96} flatShading /></mesh>
        <mesh position={[-.31, .23, .21]} rotation-z={-.2} castShadow><dodecahedronGeometry args={[.28, 0]} /><meshStandardMaterial color="#414a3d" roughness={1} flatShading /></mesh>
        <mesh position={[.12, .65, .17]} rotation-x={-Math.PI / 2}><planeGeometry args={[.4, .24]} /><meshStandardMaterial color="#66744b" side={THREE.DoubleSide} roughness={1} /></mesh>
      </group>}
      {obstacle && state.mapId === 'wetland' && <group position-y={.82} rotation-y={(position.x + position.y) * .24}>
        <mesh position-y={.22} rotation-z={.08} castShadow><cylinderGeometry args={[.31, .43, .72, 5]} /><meshStandardMaterial color="#746d59" roughness={1} flatShading /></mesh>
        <mesh position={[.13, .62, -.1]} rotation-z={-.36} castShadow><boxGeometry args={[.43, .31, .4]} /><meshStandardMaterial color="#928674" roughness={1} flatShading /></mesh>
        <mesh position={[-.23, .38, .2]} rotation-z={.54}><boxGeometry args={[.15, .68, .15]} /><meshStandardMaterial color="#514f42" roughness={1} /></mesh>
      </group>}
      {obstacle && state.mapId === 'river' && <group position-y={.82}>
        <mesh position-y={.18} rotation-y={Math.PI / 4}><dodecahedronGeometry args={[.36, 0]} /><meshStandardMaterial color="#6a6254" roughness={.92} /></mesh>
        <mesh position={[.12, .42, -.08]} rotation={[.15, .1, -.2]}><dodecahedronGeometry args={[.22, 0]} /><meshStandardMaterial color="#817765" roughness={1} /></mesh>
        <Sparkles count={5} scale={.7} size={1.3} speed={.08} color="#b4aa90" />
      </group>}
    </group>
  )
}

function EquippedGear({ unit }: { unit: Unit }) {
  const weapon = unit.equipment.weapon?.kind
  const longWeapon = weapon && ['greenDragon', 'spear', 'halberd'].includes(weapon)
  const bow = weapon === 'qilinBow' || weapon === 'crossbow'
  return <>
    {weapon && <group position={[.42, .72, .08]} rotation-z={longWeapon ? -.14 : -.42}>
      <mesh position-y={longWeapon ? .12 : -.02}><cylinderGeometry args={[.025, .035, longWeapon ? 1.5 : .72, 7]} /><meshStandardMaterial color="#6d4427" roughness={.72} /></mesh>
      {bow ? <mesh position={[0, .26, 0]} rotation-y={Math.PI / 2}><torusGeometry args={[.25, .025, 6, 18, Math.PI]} /><meshStandardMaterial color="#d0a25a" metalness={.55} roughness={.35} /></mesh>
        : <mesh position-y={longWeapon ? .91 : .47} rotation-z={weapon === 'greenDragon' ? .5 : 0}><coneGeometry args={[weapon === 'axe' ? .17 : .09, .38, 4]} /><meshStandardMaterial color={weapon === 'vermilionFan' ? '#d95742' : '#d6d9dc'} metalness={.85} roughness={.22} /></mesh>}
    </group>}
    {unit.equipment.armor && <>
      {[-.34, .34].map(side => <mesh key={side} position={[side, .98, 0]} rotation-z={side < 0 ? -.2 : .2}><sphereGeometry args={[.16, 8, 6]} /><meshStandardMaterial color={unit.equipment.armor?.kind === 'bagua' ? '#b69245' : '#737d87'} metalness={.7} roughness={.34} /></mesh>)}
      {unit.equipment.armor.kind === 'bagua' && <mesh position={[0, .74, .315]} rotation-z={Math.PI / 8}><cylinderGeometry args={[.16, .16, .045, 8]} /><meshStandardMaterial color="#d0aa4f" metalness={.65} roughness={.34} /></mesh>}
    </>}
    {(unit.equipment.offensiveMount || unit.equipment.defensiveMount) && <mesh position={[0, .08, -.38]} rotation-x={Math.PI / 2}><torusGeometry args={[.26, .045, 8, 18, Math.PI * 1.55]} /><meshStandardMaterial color="#d1b36c" metalness={.8} roughness={.28} /></mesh>}
  </>
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
  const pieceColors: Record<GeneralSkill, string> = { qianxun: '#397b72', lianying: '#397b72', guose: '#c76a78', liuli: '#c76a78', luoshen: '#7776a7', qingguo: '#7776a7', keji: '#326e6c', kurou: '#9a3a2e', tieqi: '#d7dde0', mashu: '#d7dde0', rende: '#477b4b', jijiang: '#477b4b', wusheng: '#2f8a68', longdan: '#b6cbd0', ganglie: '#a84635', feedback: '#78528d', guicai: '#78528d', jianxiong: '#8c342d', hujia: '#8c342d', yiji: '#667fa4', tiandu: '#667fa4', qingnang: '#79936c', jijiu: '#79936c', yingzi: '#b64c43', fanjian: '#b64c43', guanxing: '#d7d5c5', kongcheng: '#d7d5c5', tuxi: '#49747c', luoyi: '#8b633d', jieyin: '#b94e58', xiaoji: '#b94e58', paoxiao: '#8f3529', jizhi: '#c59b43', qicai: '#c59b43', qixi: '#2a8c91', biyue: '#a94f79', lijian: '#a94f79', zhiheng: '#3c9291', jiuyuan: '#3c9291', wushuang: '#9d3028' }
  const darkColors: Record<GeneralSkill, string> = { qianxun: '#183c38', lianying: '#183c38', guose: '#542d39', liuli: '#542d39', luoshen: '#292a50', qingguo: '#292a50', keji: '#183a3a', kurou: '#3f201c', tieqi: '#34475a', mashu: '#34475a', rende: '#244629', jijiang: '#244629', wusheng: '#174d3a', longdan: '#526f78', ganglie: '#61251e', feedback: '#3d294b', guicai: '#3d294b', jianxiong: '#271b23', hujia: '#271b23', yiji: '#25324c', tiandu: '#25324c', qingnang: '#34442f', jijiu: '#34442f', yingzi: '#54231f', fanjian: '#54231f', guanxing: '#31565e', kongcheng: '#31565e', tuxi: '#1c3438', luoyi: '#38271d', jieyin: '#4f2630', xiaoji: '#4f2630', paoxiao: '#381713', jizhi: '#385f59', qicai: '#385f59', qixi: '#17464b', biyue: '#51233b', lijian: '#51233b', zhiheng: '#193f42', jiuyuan: '#193f42', wushuang: '#351311' }
  const color = pieceColors[unit.skill], darkColor = darkColors[unit.skill]
  const factionAccent: Record<Faction, string> = { wei: '#607fae', shu: '#59a66c', wu: '#d15b4f', qun: '#9a8a74' }
  const accent = factionAccent[unit.faction]
  const selectedKind = selectedAsSlash ? 'slash' : state.selectedAsDismantle ? 'dismantle' : state.selectedAsGuose ? 'indulgence' : state.units.player.hand.find(c => c.id === selectedCardId)?.kind
  const canLijianTarget = state.lijianMode && team !== 'player' && unit.hp > 0 && unit.gender === 'male' && !state.lijianTargets.includes(team)
  const lijianSelected = state.lijianTargets.includes(team)
  const canChainTarget = selectedKind === 'ironChain' && unit.hp > 0
  const chainSelected = state.chainTargets.includes(team)
  const borrowedWielder = state.borrowedSwordWielder
  const canBorrowedWielder = selectedKind === 'borrowedSword' && team !== 'player' && !borrowedWielder && !!unit.equipment.weapon && Object.values(state.units).some(victim => canBorrowedSwordTarget(state, unit, victim))
  const canBorrowedVictim = selectedKind === 'borrowedSword' && !!borrowedWielder && canBorrowedSwordTarget(state, state.units[borrowedWielder], unit)
  const canTarget = canLijianTarget || (team !== 'player' && unit.hp > 0 && !!selectedCardId && !!selectedKind && !(unit.skills.includes('qianxun') && (selectedKind === 'snatch' || selectedKind === 'indulgence')) && (
    (selectedKind === 'slash' && canSlash(state, state.units.player, unit)) ||
    (selectedKind === 'duel' && !(unit.skills.includes('kongcheng') && unit.hand.length === 0)) || (selectedKind === 'dismantle' && (unit.hand.length > 0 || Object.values(unit.equipment).some(Boolean))) ||
    canBorrowedWielder || canBorrowedVictim ||
    selectedKind === 'indulgence' || selectedKind === 'fireAttack' || selectedKind === 'ironChain' ||
    (selectedKind === 'snatch' && (unit.hand.length > 0 || Object.values(unit.equipment).some(Boolean)) && (state.units.player.skills.includes('qicai') || combatDistance(state, state.units.player, unit) <= 1)) || state.selectedAsFanjian || state.selectedAsRende
  ))

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
    const elementalHit = unit.animation === 'fireHit' || unit.animation === 'thunderHit'
    const desiredScale = unit.animation === 'hit' || elementalHit ? .9 + Math.abs(Math.sin(clock.elapsedTime * 25)) * .12 : 1
    group.current.scale.lerp(new THREE.Vector3(desiredScale, desiredScale, desiredScale), delta * 10)
    if (unit.animation === 'attack') group.current.rotation.y = Math.sin(clock.elapsedTime * 18) * .18
    else if (unit.animation === 'hit' || elementalHit) group.current.rotation.z = Math.sin(clock.elapsedTime * 34) * (elementalHit ? .14 : .09)
    else { group.current.rotation.y *= Math.max(0, 1 - delta * 10); group.current.rotation.z *= Math.max(0, 1 - delta * 10) }
  })

  return (
    <group
      ref={group}
      position={worldPosition(unit.position)}
      onClick={e => {
        e.stopPropagation()
        if (canChainTarget) state.selectChainTarget(team)
        else if (canLijianTarget) state.selectLijianTarget(team)
        else if (canBorrowedWielder) state.selectBorrowedSwordWielder(team)
        else if (canBorrowedVictim && selectedCardId && borrowedWielder) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: borrowedWielder, targets: [borrowedWielder, team] })
        else if (canTarget && selectedCardId) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: team, asSlash: selectedAsSlash, asDismantle: state.selectedAsDismantle, asFanjian: state.selectedAsFanjian, asRende: state.selectedAsRende, asGuose: state.selectedAsGuose, materialIds: state.spearMode ? state.spearSelection : undefined, lordAssist: state.jijiangSource ?? undefined })
      }}
      onPointerEnter={() => { if (canTarget || canChainTarget || canBorrowedVictim) document.body.style.cursor = 'crosshair' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      {(canTarget || canBorrowedVictim) && (
        <mesh position-y={.06} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[.47, .56, 32]} />
          <meshBasicMaterial color="#ffcb70" transparent opacity={.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {borrowedWielder === team && <mesh position-y={.07} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.58, .67, 32]} />
        <meshBasicMaterial color="#f0b766" transparent opacity={.95} side={THREE.DoubleSide} />
      </mesh>}
      {lijianSelected && <mesh position-y={.07} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.58, .67, 32]} />
        <meshBasicMaterial color="#e98ac5" transparent opacity={.95} side={THREE.DoubleSide} />
      </mesh>}
      {chainSelected && <mesh position-y={.08} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.69, .77, 32]} />
        <meshBasicMaterial color="#6de5ed" transparent opacity={.95} side={THREE.DoubleSide} />
      </mesh>}
      {unit.chained && <mesh position-y={.34} rotation-x={Math.PI / 2}>
        <torusGeometry args={[.58, .055, 8, 24]} />
        <meshStandardMaterial color="#80d8dc" emissive="#167782" emissiveIntensity={1.4} metalness={.75} roughness={.25} />
      </mesh>}
      {unit.animation === 'fireHit' && <group position-y={.78}>
        <pointLight color="#ff5528" intensity={3.2} distance={2.4} />
        <Sparkles count={22} scale={[.9, 1.5, .9]} size={3.2} speed={1.8} color="#ff7a32" />
        <mesh scale={[.55, .9, .55]}><sphereGeometry args={[.55, 10, 8]} /><meshBasicMaterial color="#ff3d16" transparent opacity={.16} depthWrite={false} /></mesh>
      </group>}
      {unit.animation === 'thunderHit' && <group position-y={.86}>
        <pointLight color="#7ebdff" intensity={3.8} distance={2.7} />
        <Sparkles count={28} scale={[1, 1.65, 1]} size={2.6} speed={2.4} color="#9ed7ff" />
        {[0, 1, 2].map(index => <mesh key={index} position={[(index - 1) * .23, .05 - index * .12, .18]} rotation-z={(index - 1) * .22}><boxGeometry args={[.035, 1.25, .035]} /><meshBasicMaterial color="#c8edff" /></mesh>)}
      </group>}
      {unit.hp > 0 && <group position-y={2.25}>
        <mesh position-z={-.015}><boxGeometry args={[Math.max(.46, unit.maxHp * .13 + .1), .17, .035]} /><meshBasicMaterial color="#1d2020" transparent opacity={.82} /></mesh>
        {Array.from({ length: unit.maxHp }, (_, index) => {
          const center = (index - (unit.maxHp - 1) / 2) * .13
          return <mesh key={index} position={[center, 0, .014]}>
            <boxGeometry args={[.105, .105, .025]} />
            <meshBasicMaterial color={index < unit.hp ? (unit.hp <= 1 ? '#ef6152' : '#e1bd6f') : '#545b5a'} />
          </mesh>
        })}
      </group>}
      <EquippedGear unit={unit} />
      <mesh position-y={.18} castShadow>
        <cylinderGeometry args={[.38, .45, .28, 12]} />
        <meshStandardMaterial color={color} roughness={.34} metalness={.45} />
      </mesh>
      <mesh position-y={.7} castShadow>
        <cylinderGeometry args={[.28, .34, .8, 10]} />
        <meshStandardMaterial color={darkColor} roughness={.55} />
      </mesh>
      <mesh position={[0, .78, -.23]} rotation-x={.08} castShadow>
        <coneGeometry args={[.43, .88, 6]} />
        <meshStandardMaterial color={darkColor} roughness={.82} side={THREE.DoubleSide} />
      </mesh>
      {[-.35, .35].map(side => <group key={side} position={[side, .82, 0]} rotation-z={side < 0 ? .2 : -.2}>
        <mesh position-y={-.08}><capsuleGeometry args={[.075, .42, 4, 7]} /><meshStandardMaterial color={darkColor} roughness={.62} /></mesh>
        <mesh position-y={-.36}><sphereGeometry args={[.085, 9, 7]} /><meshStandardMaterial color="#d6b28a" roughness={.85} /></mesh>
      </group>)}
      {[-.16, .16].map(side => <mesh key={side} position={[side, .17, 0]}><capsuleGeometry args={[.1, .3, 4, 7]} /><meshStandardMaterial color="#242329" roughness={.8} /></mesh>)}
      <mesh position-y={1.2} castShadow>
        <sphereGeometry args={[.29, 16, 12]} />
        <meshStandardMaterial color="#d6b28a" roughness={.8} />
      </mesh>
      <mesh position={[0, 1.33, -.12]} scale={[1.04, .78, .82]}>
        <sphereGeometry args={[.27, 12, 9]} />
        <meshStandardMaterial color={unit.gender === 'female' ? '#332326' : '#24201d'} roughness={.92} />
      </mesh>
      {[-.1, .1].map(side => <mesh key={side} position={[side, 1.23, .264]} scale={[1, .55, .5]}>
        <sphereGeometry args={[.027, 7, 5]} />
        <meshStandardMaterial color="#151316" roughness={.45} />
      </mesh>)}
      <mesh position={[0, 1.1, .276]} rotation-x={Math.PI / 2} scale={[1, .55, 1]}>
        <torusGeometry args={[.055, .012, 5, 10, Math.PI]} />
        <meshStandardMaterial color="#6e3a32" roughness={.9} />
      </mesh>
      <mesh position={[0, .91, .285]}>
        <boxGeometry args={[.58, .11, .045]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={.18} roughness={.58} />
      </mesh>
      {unit.skill === 'qianxun' && <>
        <mesh position={[0, 1.49, 0]}><boxGeometry args={[.48, .16, .35]} /><meshStandardMaterial color="#51412f" metalness={.68} /></mesh>
        <mesh position={[0, 1.64, 0]}><cylinderGeometry args={[.1, .13, .24, 7]} /><meshStandardMaterial color="#bd9145" metalness={.82} /></mesh>
        <group position={[-.41, .84, .1]} rotation={[0, 0, .36]}>{[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[(i - 2.5) * .05, .42, 0]} rotation-z={(i - 2.5) * -.09}><capsuleGeometry args={[.032, .52, 3, 6]} /><meshStandardMaterial color="#ddd8c4" /></mesh>)}</group>
        <group position={[.38, .82, .12]} rotation-z={-.24}>{[-.12, 0, .12].map((y, i) => <mesh key={i} position={[0, y, 0]}><boxGeometry args={[.42, .055, .08]} /><meshStandardMaterial color="#9b7445" /></mesh>)}</group>
        <Sparkles count={10} scale={.9} size={1.7} speed={.3} color="#ff9d55" position-y={.65} />
      </>}
      {unit.skill === 'guose' && <>
        <mesh position={[0, 1.48, 0]}><torusGeometry args={[.24, .035, 7, 18, Math.PI]} /><meshStandardMaterial color="#d8a773" metalness={.75} /></mesh>
        {[-.19, .19].map(x => <mesh key={x} position={[x, 1.55, 0]}><sphereGeometry args={[.07, 10, 8]} /><meshStandardMaterial color="#d56975" emissive="#7a2737" emissiveIntensity={.55} /></mesh>)}
        <group position={[-.42, .85, .1]} rotation={[0, 0, .36]}>{[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[(i - 2.5) * .052, .42, 0]} rotation-z={(i - 2.5) * -.1}><capsuleGeometry args={[.032, .5, 3, 6]} /><meshStandardMaterial color="#f0ddce" /></mesh>)}</group>
        <group position={[.39, .72, .13]}><mesh position-y={.28}><boxGeometry args={[.25, .48, .22]} /><meshStandardMaterial color="#b55b47" metalness={.45} /></mesh><pointLight color="#ffbb72" intensity={.7} distance={1.5} /></group>
      </>}
      {unit.skill === 'luoshen' && <>
        <mesh position={[0, 1.5, 0]}><torusGeometry args={[.25, .028, 7, 18, Math.PI * 1.25]} /><meshStandardMaterial color="#d5d5e5" metalness={.85} emissive="#595b99" emissiveIntensity={.5} /></mesh>
        {[-.18, .18].map(x => <mesh key={x} position={[x, 1.58, 0]}><sphereGeometry args={[.065, 10, 8]} /><meshStandardMaterial color="#8579b8" emissive="#40356f" emissiveIntensity={.75} /></mesh>)}
        <group position={[-.4, .84, .1]} rotation={[0, 0, .38]}>{[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[(i - 2.5) * .052, .4, 0]} rotation-z={(i - 2.5) * -.1}><capsuleGeometry args={[.032, .5, 3, 6]} /><meshStandardMaterial color="#bfc2dd" transparent opacity={.86} /></mesh>)}</group>
        <Sparkles count={12} scale={.9} size={1.8} speed={.25} color="#b9b5ff" position-y={1.05} />
      </>}
      {unit.skill === 'keji' && <>
        <mesh position={[0, 1.48, 0]}><boxGeometry args={[.48, .13, .36]} /><meshStandardMaterial color="#263b3d" metalness={.6} /></mesh>
        <mesh position={[0, 1.62, 0]}><cylinderGeometry args={[.11, .14, .24, 7]} /><meshStandardMaterial color="#ac8745" metalness={.8} /></mesh>
        <group position={[-.42, .84, .08]} rotation={[0, 0, .35]}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[(i - 2) * .055, .43, 0]} rotation-z={(i - 2) * -.1}><capsuleGeometry args={[.034, .48, 3, 6]} /><meshStandardMaterial color="#d7cba8" /></mesh>)}</group>
        <group position={[.44, .79, 0]} rotation-z={-.22}><mesh position-y={.3}><cylinderGeometry args={[.032, .032, 1.75, 7]} /><meshStandardMaterial color="#443122" /></mesh><mesh position={[0, 1.17, 0]}><boxGeometry args={[.18, .7, .055]} /><meshStandardMaterial color="#b9c3c0" metalness={.92} /></mesh></group>
      </>}
      {unit.skill === 'kurou' && <>
        <mesh position={[0, 1.47, 0]}><cylinderGeometry args={[.3, .27, .18, 10]} /><meshStandardMaterial color="#4a2b25" metalness={.65} /></mesh>
        {[-.36, .36].map(x => <mesh key={x} position={[x, .9, 0]} rotation-z={x < 0 ? -.3 : .3}><boxGeometry args={[.3, .48, .34]} /><meshStandardMaterial color="#7e332a" metalness={.55} roughness={.5} /></mesh>)}
        <group position={[.44, .78, .12]} rotation-z={-.18}><mesh><boxGeometry args={[.42, .78, .12]} /><meshStandardMaterial color="#3c2920" metalness={.5} /></mesh>{[-.14, .14].map(x => <mesh key={x} position={[x, 0, .075]}><boxGeometry args={[.035, .7, .03]} /><meshStandardMaterial color="#a57a3e" metalness={.8} /></mesh>)}</group>
        <group position={[-.43, .75, 0]} rotation-z={.32}>{[0, 1, 2, 3].map(i => <mesh key={i} position={[0, .18 + i * .18, 0]}><torusGeometry args={[.075, .025, 6, 10]} /><meshStandardMaterial color="#37302d" metalness={.9} /></mesh>)}</group>
      </>}
      {unit.skill === 'tieqi' && <>
        <mesh position={[0, 1.49, 0]}><coneGeometry args={[.3, .34, 8]} /><meshStandardMaterial color="#cdd5d8" metalness={.92} roughness={.2} /></mesh>
        <mesh position={[0, 1.74, 0]} rotation-z={-.12}><capsuleGeometry args={[.045, .46, 3, 6]} /><meshStandardMaterial color="#edf1ee" roughness={.65} /></mesh>
        {[-.34, .34].map(x => <mesh key={x} position={[x, .9, 0]} rotation-z={x < 0 ? -.32 : .32}><dodecahedronGeometry args={[.2, 0]} /><meshStandardMaterial color="#9eaeb6" metalness={.85} /></mesh>)}
        <group position={[-.46, .77, 0]} rotation-z={.2}><mesh position-y={.34}><cylinderGeometry args={[.028, .028, 2.05, 7]} /><meshStandardMaterial color="#445463" metalness={.65} /></mesh><mesh position={[0, 1.42, 0]}><coneGeometry args={[.12, .48, 5]} /><meshStandardMaterial color="#e3e9e8" metalness={.98} roughness={.12} /></mesh></group>
      </>}
      {unit.skill === 'rende' && <>
        <mesh position={[0, 1.48, 0]}><cylinderGeometry args={[.26, .3, .2, 8]} /><meshStandardMaterial color="#ad8d3f" metalness={.85} /></mesh>
        <mesh position={[0, 1.68, 0]}><sphereGeometry args={[.105, 10, 8]} /><meshStandardMaterial color="#66a26b" emissive="#214f2a" emissiveIntensity={.65} /></mesh>
        {[-1, 1].map(side => <group key={side} position={[side * .38, .82, .05]} rotation-z={side * -.28}>
          <mesh position-y={.28}><boxGeometry args={[.1, 1.45, .045]} /><meshStandardMaterial color="#d7d2b8" metalness={.9} roughness={.18} /></mesh>
          <mesh position={[0, -.46, 0]}><boxGeometry args={[.24, .08, .08]} /><meshStandardMaterial color="#c79e46" metalness={.85} /></mesh>
        </group>)}
      </>}
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
      {unit.skill === 'yiji' && <>
        <mesh position={[0, 1.48, 0]}><boxGeometry args={[.52, .12, .36]} /><meshStandardMaterial color="#242b3d" roughness={.65} /></mesh>
        <mesh position={[0, 1.61, 0]}><cylinderGeometry args={[.12, .15, .25, 6]} /><meshStandardMaterial color="#8595b6" metalness={.45} /></mesh>
        <group position={[-.43, .84, .08]} rotation={[0, 0, .36]}>{[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[(i - 2.5) * .05, .42, 0]} rotation-z={(i - 2.5) * -.09}><capsuleGeometry args={[.03, .52, 3, 6]} /><meshStandardMaterial color="#d6d1ba" /></mesh>)}</group>
        <group position={[.36, .88, .15]} rotation-z={-.2}>{[-.12, 0, .12].map((y, i) => <mesh key={i} position={[0, y, 0]}><boxGeometry args={[.38, .055, .08]} /><meshStandardMaterial color="#8b6437" roughness={.9} /></mesh>)}</group>
      </>}
      {unit.skill === 'qingnang' && <>
        <mesh position={[0, 1.48, 0]}><cylinderGeometry args={[.28, .32, .12, 12]} /><meshStandardMaterial color="#d7d0b4" roughness={.92} /></mesh>
        <mesh position={[0, 1.04, .24]}><coneGeometry args={[.18, .62, 9]} /><meshStandardMaterial color="#e0ded0" roughness={1} /></mesh>
        <group position={[.44, .84, 0]} rotation-z={-.2}><mesh position-y={.35}><cylinderGeometry args={[.035, .045, 1.55, 7]} /><meshStandardMaterial color="#725238" /></mesh><mesh position={[0, 1.08, 0]}><sphereGeometry args={[.12, 10, 8]} /><meshStandardMaterial color="#74a66d" emissive="#285927" emissiveIntensity={.8} /></mesh></group>
        <mesh position={[-.36, .74, .18]}><sphereGeometry args={[.2, 10, 8]} /><meshStandardMaterial color="#916943" roughness={.9} /></mesh>
        <mesh position={[-.36, .98, .18]}><torusGeometry args={[.08, .025, 6, 14]} /><meshStandardMaterial color="#b68c55" /></mesh>
      </>}
      {unit.skill === 'yingzi' && <>
        <mesh position={[0, 1.48, 0]}><cylinderGeometry args={[.27, .23, .2, 8]} /><meshStandardMaterial color="#b88a42" metalness={.82} roughness={.25} /></mesh>
        <mesh position={[0, 1.67, 0]}><boxGeometry args={[.13, .3, .22]} /><meshStandardMaterial color="#cfb064" metalness={.88} /></mesh>
        <group position={[-.42, .84, .1]} rotation-z={.36}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[(i - 2) * .055, .43, 0]} rotation-z={(i - 2) * -.1}><capsuleGeometry args={[.032, .5, 3, 6]} /><meshStandardMaterial color="#eee4cf" /></mesh>)}</group>
        <group position={[.45, .84, 0]} rotation-z={-.3}><mesh position-y={.3}><cylinderGeometry args={[.03, .03, 1.6, 7]} /><meshStandardMaterial color="#4e3120" /></mesh><mesh position={[0, 1.12, 0]}><boxGeometry args={[.15, .62, .06]} /><meshStandardMaterial color="#d5d5cc" metalness={.94} /></mesh></group>
      </>}
      {unit.skill === 'guanxing' && <>
        <mesh position={[0, 1.49, 0]}><boxGeometry args={[.54, .13, .38]} /><meshStandardMaterial color="#d8d7ca" roughness={.78} /></mesh>
        <mesh position={[0, 1.64, 0]}><boxGeometry args={[.22, .22, .27]} /><meshStandardMaterial color="#315c65" roughness={.65} /></mesh>
        <group position={[-.43, .84, .1]} rotation-z={.35}>{[0, 1, 2, 3, 4, 5, 6].map(i => <mesh key={i} position={[(i - 3) * .045, .44 + Math.abs(i - 3) * .012, 0]} rotation-z={(i - 3) * -.085}><capsuleGeometry args={[.03, .58, 3, 6]} /><meshStandardMaterial color="#f1eee0" /></mesh>)}</group>
        <mesh position={[.32, 1.38, 0]}><torusGeometry args={[.11, .025, 6, 16]} /><meshStandardMaterial color="#79b6bd" emissive="#27666e" emissiveIntensity={.8} /></mesh>
      </>}
      {unit.skill === 'tuxi' && <>
        <mesh position={[0, 1.45, 0]}><coneGeometry args={[.31, .34, 8]} /><meshStandardMaterial color="#516b70" metalness={.78} roughness={.3} /></mesh>
        <mesh position={[0, 1.72, 0]} rotation-z={-.16}><capsuleGeometry args={[.035, .38, 3, 6]} /><meshStandardMaterial color="#a33932" /></mesh>
        {[-.34, .34].map(x => <mesh key={x} position={[x, .9, 0]} rotation-z={x < 0 ? -.3 : .3}><dodecahedronGeometry args={[.22, 0]} /><meshStandardMaterial color="#395b62" metalness={.72} roughness={.36} /></mesh>)}
        <group position={[.46, .8, 0]} rotation-z={-.2}><mesh position-y={.32}><cylinderGeometry args={[.03, .03, 1.95, 7]} /><meshStandardMaterial color="#3f2b20" /></mesh><mesh position={[0, 1.3, 0]} rotation-z={-.28}><boxGeometry args={[.2, .72, .07]} /><meshStandardMaterial color="#bdc7c4" metalness={.94} /></mesh></group>
      </>}
      {unit.skill === 'luoyi' && <>
        <mesh position={[0, 1.44, 0]}><cylinderGeometry args={[.32, .27, .22, 8]} /><meshStandardMaterial color="#65462e" metalness={.68} roughness={.38} /></mesh>
        {[-.38, .38].map(x => <mesh key={x} position={[x, .91, 0]}><dodecahedronGeometry args={[.27, 0]} /><meshStandardMaterial color="#7d5835" metalness={.65} roughness={.42} /></mesh>)}
        {[-.48, .48].map((x, i) => <group key={x} position={[x, .72, 0]} rotation-z={x < 0 ? .28 : -.28}><mesh position-y={.28}><cylinderGeometry args={[.04, .04, 1.25, 8]} /><meshStandardMaterial color="#4d3020" /></mesh><mesh position-y={.94}><sphereGeometry args={[.22, 10, 8]} /><meshStandardMaterial color="#8c7658" metalness={.86} roughness={.25} /></mesh></group>)}
        <mesh position={[0, 1.02, .25]}><boxGeometry args={[.5, .2, .08]} /><meshStandardMaterial color="#b58b4f" roughness={.8} /></mesh>
      </>}
      {unit.skill === 'jieyin' && <>
        <mesh position={[0, 1.48, 0]}><torusGeometry args={[.25, .045, 7, 16, Math.PI]} /><meshStandardMaterial color="#d5ae58" metalness={.8} /></mesh>
        {[-.34, .34].map(x => <mesh key={x} position={[x, .92, 0]}><dodecahedronGeometry args={[.19, 0]} /><meshStandardMaterial color="#a94651" metalness={.55} roughness={.42} /></mesh>)}
        <group position={[.43, .84, 0]} rotation-z={-.32}><mesh position-y={.35}><torusGeometry args={[.28, .025, 6, 18]} /><meshStandardMaterial color="#b88745" /></mesh><mesh position={[0, .35, 0]}><cylinderGeometry args={[.018, .018, .72, 6]} /><meshStandardMaterial color="#d4c29b" /></mesh></group>
        <group position={[-.4, .78, .08]}>{[-.12, 0, .12].map((x, i) => <mesh key={i} position={[x, i * .1, 0]} rotation-z={-.15}><boxGeometry args={[.06, .65, .04]} /><meshStandardMaterial color="#d5d3c5" metalness={.8} /></mesh>)}</group>
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
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [8.5, 10.1, 9.2], fov: 40 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0b1b22']} />
      <fog attach="fog" args={['#0b1b22', 12, 21]} />
      <BattleLighting />
      <pointLight position={[-5, 3, -4]} intensity={24} distance={11} color="#348ca5" />
      <pointLight position={[5, 3, 4]} intensity={17} distance={10} color="#b2503e" />
      <Suspense fallback={null}>
        <group position-y={-.05}>
          {cells.map(p => <Tile key={`${p.x}-${p.y}`} position={p} />)}
          <UnitPiece team="player" />
          <UnitPiece team="north" />
          <UnitPiece team="east" />
          <UnitPiece team="west" />
        </group>
        <WorldScenery />
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

function WorldScenery() {
  const mapId = useGameStore(s => s.mapId)
  if (mapId === 'wetland') return <group position-y={-.15}>
    {[-1, 1].map(side => <group key={side} position={[side * 5.4, 0, 0]}>
      <mesh position-y={.1} rotation-x={-Math.PI / 2}><circleGeometry args={[1.3, 20]} /><meshStandardMaterial color="#20444b" roughness={.42} /></mesh>
      {[-.75, .1, .75].map((offset, index) => <group key={index} position={[offset, 0, index % 2 ? .54 : -.5]}>
        <mesh position-y={.39} rotation-z={index % 2 ? -.18 : .12}><cylinderGeometry args={[.18, .24, .82, 5]} /><meshStandardMaterial color="#605c4e" roughness={1} flatShading /></mesh>
        <mesh position-y={.88}><coneGeometry args={[.1, .39, 5]} /><meshStandardMaterial color="#876f4e" roughness={1} /></mesh>
      </group>)}
    </group>)}
    {[-4.6, 4.6].map((x, index) => <group key={x} position={[x, 0, index ? -5.1 : 5.1]}>
      <mesh position-y={.65}><cylinderGeometry args={[.07, .1, 1.3, 6]} /><meshStandardMaterial color="#4c3928" /></mesh>
      <mesh position-y={1.27}><coneGeometry args={[.42, 1.08, 7]} /><meshStandardMaterial color="#385b42" roughness={1} flatShading /></mesh>
    </group>)}
  </group>
  if (mapId === 'highland') return <group position-y={-.15}>
    {[-1, 1].flatMap((sideX, xi) => [-1, 1].map((sideZ, zi) => <group key={`${xi}-${zi}`} position={[sideX * 5.55, 0, sideZ * 5.55]} rotation-y={(xi + zi) * .6}>
      <mesh position-y={.42} castShadow><dodecahedronGeometry args={[.8, 0]} /><meshStandardMaterial color="#414c40" roughness={1} flatShading /></mesh>
      <mesh position={[.24, .72, -.2]} castShadow><coneGeometry args={[.62, 1.22, 5]} /><meshStandardMaterial color="#64705b" roughness={1} flatShading /></mesh>
      <mesh position={[-.37, .34, .24]}><dodecahedronGeometry args={[.46, 0]} /><meshStandardMaterial color="#313d35" roughness={1} flatShading /></mesh>
    </group>))}
    {[-4.1, -2.7, 2.7, 4.1].map((x, i) => <group key={x} position={[x, 0, i % 2 ? -5.45 : 5.45]}>
      <mesh position-y={.45}><cylinderGeometry args={[.08, .11, .9, 6]} /><meshStandardMaterial color="#58452d" roughness={1} /></mesh>
      <mesh position-y={.9}><coneGeometry args={[.42, .9, 7]} /><meshStandardMaterial color="#264333" roughness={1} flatShading /></mesh>
      <mesh position-y={1.28}><coneGeometry args={[.32, .82, 7]} /><meshStandardMaterial color="#31513b" roughness={1} flatShading /></mesh>
    </group>)}
  </group>
  return <group position-y={-.15}>
    {[-1, 1].map(side => <group key={side} position={[side * 5.65, 0, side * .35]} rotation-y={side < 0 ? Math.PI / 2 : -Math.PI / 2}>
      <mesh position-y={.65}><boxGeometry args={[1.5, 1.35, .5]} /><meshStandardMaterial color="#263234" roughness={.95} /></mesh>
      <mesh position={[0, .62, -.27]}><boxGeometry args={[.62, .82, .12]} /><meshStandardMaterial color="#111b1d" /></mesh>
      {[-.58, .58].map(x => <group key={x} position={[x, .82, 0]}><mesh><cylinderGeometry args={[.19, .24, 1.65, 8]} /><meshStandardMaterial color="#303b3b" roughness={.9} /></mesh><mesh position-y={.88} rotation-y={Math.PI / 4}><coneGeometry args={[.37, .28, 4]} /><meshStandardMaterial color="#552e27" /></mesh></group>)}
      <mesh position={[0, 1.55, 0]} rotation-x={-Math.PI / 2}><torusGeometry args={[.28, .045, 8, 24]} /><meshStandardMaterial color="#d88a3b" emissive="#a34118" emissiveIntensity={1.8} /></mesh>
      <pointLight position={[0, 1.65, 0]} intensity={5} distance={3.5} color="#ff7738" />
    </group>)}
    {[-4.7, 4.7].flatMap((x, xi) => [-4.8, 4.8].map((z, zi) => <group key={`${xi}-${zi}`} position={[x, 0, z]} rotation-y={(xi + zi) * .7}>
      <mesh position-y={.35}><dodecahedronGeometry args={[.55 + (xi + zi) * .08, 0]} /><meshStandardMaterial color="#253033" roughness={1} /></mesh>
      <mesh position={[.36, .18, -.2]}><dodecahedronGeometry args={[.34, 0]} /><meshStandardMaterial color="#354040" roughness={1} /></mesh>
    </group>))}
    {[-3.3, 3.3].map((x, i) => <group key={x} position={[x, 0, i ? -5.4 : 5.4]}>
      <mesh position-y={.8}><cylinderGeometry args={[.035, .045, 1.8, 7]} /><meshStandardMaterial color="#6d4829" /></mesh>
      <mesh position={[.28, 1.32, 0]}><planeGeometry args={[.55, .7]} /><meshStandardMaterial color={i ? '#8e302a' : '#246b78'} side={THREE.DoubleSide} roughness={.9} /></mesh>
    </group>)}
  </group>
}

function Hearts({ hp, max }: { hp: number; max: number }) {
  return <div className="hearts" aria-label={`${hp}/${max} 体力`}>{Array.from({ length: max }, (_, i) => <span key={i} className={i < hp ? 'full' : ''}>◆</span>)}</div>
}

function PlayerStatus({ team }: { team: Team }) {
  const unit = useGameStore(s => s.units[team])
  const score = useGameStore(s => s.scores[team])
  const portraits: Record<GeneralSkill, string> = { qianxun: '/heroes/lu-xun.png', lianying: '/heroes/lu-xun.png', guose: '/heroes/da-qiao.png', liuli: '/heroes/da-qiao.png', luoshen: '/heroes/zhen-ji.png', qingguo: '/heroes/zhen-ji.png', keji: '/heroes/lu-meng.png', kurou: '/heroes/huang-gai.png', tieqi: '/heroes/ma-chao.png', mashu: '/heroes/ma-chao.png', rende: '/heroes/liu-bei.png', jijiang: '/heroes/liu-bei.png', wusheng: '/heroes/guan-yun.png', longdan: '/heroes/zhao-ling.png', ganglie: '/heroes/xiahou-lie.png', feedback: '/heroes/sima-xuan.png', guicai: '/heroes/sima-xuan.png', jianxiong: '/heroes/cao-cao.png', hujia: '/heroes/cao-cao.png', yiji: '/heroes/guo-jia.png', tiandu: '/heroes/guo-jia.png', qingnang: '/heroes/hua-tuo.png', jijiu: '/heroes/hua-tuo.png', yingzi: '/heroes/zhou-yu.png', fanjian: '/heroes/zhou-yu.png', guanxing: '/heroes/zhuge-liang.png', kongcheng: '/heroes/zhuge-liang.png', tuxi: '/heroes/zhang-liao.png', luoyi: '/heroes/xu-chu.png', jieyin: '/heroes/sun-shangxiang.png', xiaoji: '/heroes/sun-shangxiang.png', paoxiao: '/heroes/zhang-fei.png', jizhi: '/heroes/huang-yueying.png', qicai: '/heroes/huang-yueying.png', qixi: '/heroes/gan-ning.png', biyue: '/heroes/diao-chan.png', lijian: '/heroes/diao-chan.png', zhiheng: '/heroes/sun-quan.png', jiuyuan: '/heroes/sun-quan.png', wushuang: '/heroes/lu-bu.png' }
  const skillCopy = { rende: '仁德/激将 · 赠牌回血/蜀将代杀', jijiang: '激将 · 蜀势力忠臣代出杀', hujia: '护驾 · 魏势力忠臣代出闪', wusheng: '武圣 · 红牌可当杀', longdan: '龙胆 · 杀闪互化', ganglie: '刚烈 · 受伤后判定反击', feedback: '反馈/鬼才 · 受伤获牌/改判', jianxiong: '奸雄/护驾 · 受伤获牌/魏将代闪', yiji: '天妒/遗计 · 获判定牌/受伤摸二', tiandu: '天妒 · 获得判定牌', qingnang: '青囊/急救 · 弃牌治疗/红牌救人', jijiu: '急救 · 红牌可当桃', yingzi: '英姿/反间 · 摸三张/猜花色', fanjian: '反间 · 赠牌猜花色', guanxing: '观星/空城 · 调牌堆/免杀与决斗', kongcheng: '空城 · 无手牌免杀与决斗', tuxi: '突袭 · 从两名角色处获得手牌', luoyi: '裸衣 · 少摸一张并强化杀/决斗', jieyin: '结姻/枭姬 · 双疗/失装备摸牌', xiaoji: '枭姬 · 失去装备摸两张', paoxiao: '咆哮 · 出杀无次数限制', jizhi: '集智/奇才 · 摸牌/锦囊无距离', qixi: '奇袭 · 黑牌可当过河拆桥', biyue: '离间/闭月 · 男性决斗/结束摸牌', lijian: '离间 · 弃牌令两名男性决斗', zhiheng: '制衡/救援 · 换牌/吴将桃强化', jiuyuan: '救援 · 吴将桃额外回复一点', wushuang: '无双 · 杀与决斗需双响应', guicai: '鬼才 · 使用手牌修改判定', qicai: '奇才 · 锦囊无距离限制' } as const
  const factionLabel: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }
  const lordSkill = unit.identity === 'lord' ? unit.skills.includes('jijiang') ? ' · 激将' : unit.skills.includes('hujia') ? ' · 护驾' : '' : ''
  return (
    <section className={`status ${team}`}>
      <div className="avatar"><img src={portraits[unit.skill]} alt="" /><span>{team === 'player' ? '主' : unit.revealed ? IDENTITY_LABEL[unit.identity].slice(0, 1) : '?'}</span></div>
      <div className="status-copy">
        <div className="name-row"><strong>{unit.name}</strong><span>{factionLabel[unit.faction]} · {team === 'player' || unit.revealed ? IDENTITY_LABEL[unit.identity] : '身份未知'}</span></div>
        <Hearts hp={unit.hp} max={unit.maxHp} />
        <div className="status-meta"><span>手牌 {unit.hand.length}</span><span>据点 {score}/3</span>{unit.chained && <span>⛓ 连环</span>}</div>
        <div className="equipment-line">{unit.equipment.weapon ? CARD_LABEL[unit.equipment.weapon.kind] : '无武器'} · {unit.equipment.armor ? CARD_LABEL[unit.equipment.armor.kind] : '无防具'}{unit.equipment.offensiveMount ? ` · ${CARD_LABEL[unit.equipment.offensiveMount.kind]}` : ''}{unit.equipment.defensiveMount ? ` · ${CARD_LABEL[unit.equipment.defensiveMount.kind]}` : ''}{unit.judgement.length ? ` · 判定 ${unit.judgement.map(c => CARD_LABEL[c.kind]).join('/')}` : ''}</div>
        <div className="skill-line">{unit.skill === 'qianxun' ? '谦逊/连营 · 免顺手乐/空手摸牌' : unit.skill === 'lianying' ? '连营 · 失最后手牌摸一张' : unit.skill === 'guose' ? '国色/流离 · 方片乐/转移杀' : unit.skill === 'liuli' ? '流离 · 弃牌转移杀' : unit.skill === 'luoshen' ? '洛神/倾国 · 黑判获牌/黑牌作闪' : unit.skill === 'qingguo' ? '倾国 · 黑色手牌可当闪' : unit.skill === 'keji' ? '克己 · 未出杀则跳过弃牌' : unit.skill === 'kurou' ? '苦肉 · 失去体力并摸两张' : unit.skill === 'tieqi' ? '马术/铁骑 · 距离-1/红判禁闪' : unit.skill === 'mashu' ? '马术 · 计算距离时始终-1' : skillCopy[unit.skill]}{lordSkill}</div>
      </div>
    </section>
  )
}

function CardView({ card, selected }: { card: Card; selected: boolean }) {
  const selectCard = useGameStore(s => s.selectCard)
  const toggleDiscard = useGameStore(s => s.toggleDiscard)
  const state = useGameStore()
  const discarding = state.phase === 'player' && state.turnStage === 'discard'
  const disabled = !discarding && (state.phase !== 'player' || (card.kind === 'peach' && state.units.player.hp >= state.units.player.maxHp) || (isSlashKind(card.kind) && state.units.player.attacksUsed >= slashLimit(state.units.player)) || (card.kind === 'wine' && state.units.player.wineUsed))
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
  const deckMode = useGameStore(s => s.deckMode)
  return <div className="overlay"><section className="tutorial panel">
    <button className="icon-button close" onClick={close} aria-label="关闭引导"><X /></button>
    <span className="eyebrow">战术简报</span>
    <h1>逐鹿中原，决胜九宫</h1>
    <div className="steps">
      <div><b>01</b><strong>身份</strong><p>你是主公；其余三人的忠臣、反贼、内奸身份每局随机并保持隐藏。找出敌人，误杀忠臣会失去所有牌。</p></div>
      <div><b>02</b><strong>战棋</strong><p>选将前可选择双河、围城、山谷或泽国战场，以及标准或扩展牌池。每回合获得 4 点移动力；涉水与泥沼耗 2 点，桥梁只耗 1 点；围城地图需争夺城墙入口，山谷地图由山壁分割侧翼，泽国地图的环形水道提供中央涉水和侧翼过桥两条路线。森林提供掩护；{deckMode === 'expanded' ? '扩展牌池中，森林火焰伤害 +1，水域火焰伤害 -1，水域和泥沼的雷电伤害 +1；' : ''}山脊射程 +1，瞭望台射程 +2；营地结束补牌，受伤时在村落结束回合可回复体力。邻接设施后选一张手牌再点击：军需箱弃一摸二，医庐回血，战鼓补充移动与出杀机会，烽燧公开最近角色的身份；所有设施每轮重新补给。</p></div>
      <div><b>03</b><strong>牌局</strong><p>选中【杀】后，棋盘红圈显示当前有效攻击范围；击杀反贼摸三张；忠臣可发动护驾；遭遇杀与群体锦囊时亲自响应。</p></div>
    </div>
    <button className="primary" onClick={close}>进入战场</button>
  </section></div>
}

const GENERAL_OPTIONS: { skill: GeneralSkill; name: string; title: string; faction: string; portrait: string; skillName: string; copy: string }[] = [
  { skill: 'qianxun', name: '陆逊', title: '儒生雄才', faction: '吴', portrait: '/heroes/lu-xun.png', skillName: '谦逊 · 连营', copy: '不能成为顺手牵羊和乐不思蜀的目标；失去最后一张手牌后摸一张牌。' },
  { skill: 'guose', name: '大乔', title: '矜持之花', faction: '吴', portrait: '/heroes/da-qiao.png', skillName: '国色 · 流离', copy: '方片牌可当【乐不思蜀】；成为杀目标时弃牌，将杀转移给攻击范围内其他角色。' },
  { skill: 'luoshen', name: '甄姬', title: '薄幸的美人', faction: '魏', portrait: '/heroes/zhen-ji.png', skillName: '洛神 · 倾国', copy: '回合开始连续获得黑色判定牌直到出现红色；黑色手牌可以当【闪】。' },
  { skill: 'keji', name: '吕蒙', title: '白衣渡江', faction: '吴', portrait: '/heroes/lu-meng.png', skillName: '克己', copy: '若本回合没有使用【杀】，结束出牌时跳过弃牌阶段。' },
  { skill: 'kurou', name: '黄盖', title: '轻身为国', faction: '吴', portrait: '/heroes/huang-gai.png', skillName: '苦肉', copy: '出牌阶段可失去 1 点体力并摸两张牌，且可以连续发动。' },
  { skill: 'tieqi', name: '马超', title: '一骑当千', faction: '蜀', portrait: '/heroes/ma-chao.png', skillName: '马术 · 铁骑', copy: '与其他角色的距离始终 -1；使用杀时红色判定令目标不能使用闪。' },
  { skill: 'rende', name: '刘备', title: '乱世的枭雄', faction: '蜀', portrait: '/heroes/liu-bei.png', skillName: '仁德 · 激将', copy: '可将任意手牌交给其他角色；每回合累计给出两张时回复体力。' },
  { skill: 'wusheng', name: '关羽', title: '美髯公', faction: '蜀', portrait: '/heroes/guan-yun.png', skillName: '武圣', copy: '红色牌可以当【杀】使用。' },
  { skill: 'longdan', name: '赵云', title: '少年将军', faction: '蜀', portrait: '/heroes/zhao-ling.png', skillName: '龙胆', copy: '【杀】与【闪】可以相互转化。' },
  { skill: 'ganglie', name: '夏侯惇', title: '独眼的罗刹', faction: '魏', portrait: '/heroes/xiahou-lie.png', skillName: '刚烈', copy: '受伤后判定，反击伤害来源。' },
  { skill: 'feedback', name: '司马懿', title: '狼顾之鬼', faction: '魏', portrait: '/heroes/sima-xuan.png', skillName: '反馈 · 鬼才', copy: '受伤后获得来源牌；不利判定时自动用手牌改判。' },
  { skill: 'jianxiong', name: '曹操', title: '魏武帝', faction: '魏', portrait: '/heroes/cao-cao.png', skillName: '奸雄 · 护驾', copy: '受到伤害后获得造成伤害的牌；魏势力忠臣可替你出闪。' },
  { skill: 'yiji', name: '郭嘉', title: '早终的先知', faction: '魏', portrait: '/heroes/guo-jia.png', skillName: '天妒 · 遗计', copy: '获得自己的判定牌；每受到一次伤害摸两张牌。' },
  { skill: 'qingnang', name: '华佗', title: '神医', faction: '群', portrait: '/heroes/hua-tuo.png', skillName: '青囊 · 急救', copy: '每回合弃一张牌治疗友方；濒死响应时红牌可当【桃】。' },
  { skill: 'yingzi', name: '周瑜', title: '大都督', faction: '吴', portrait: '/heroes/zhou-yu.png', skillName: '英姿 · 反间', copy: '摸牌阶段摸三张；每回合赠出一张牌让目标猜花色。' },
  { skill: 'guanxing', name: '诸葛亮', title: '迟暮的丞相', faction: '蜀', portrait: '/heroes/zhuge-liang.png', skillName: '观星 · 空城', copy: '回合开始调整牌堆顶；没有手牌时不能成为杀或决斗目标。' },
  { skill: 'tuxi', name: '张辽', title: '前将军', faction: '魏', portrait: '/heroes/zhang-liao.png', skillName: '突袭', copy: '摸牌阶段改为从至多两名有手牌的敌方角色各获得一张牌。' },
  { skill: 'luoyi', name: '许褚', title: '虎痴', faction: '魏', portrait: '/heroes/xu-chu.png', skillName: '裸衣', copy: '摸牌阶段少摸一张，本回合杀与决斗造成的伤害增加 1。' },
  { skill: 'jieyin', name: '孙尚香', title: '弓腰姬', faction: '吴', portrait: '/heroes/sun-shangxiang.png', skillName: '结姻 · 枭姬', copy: '弃两牌与受伤男性各回复体力；失去装备后摸两张牌。' },
  { skill: 'paoxiao', name: '张飞', title: '万夫不当', faction: '蜀', portrait: '/heroes/zhang-fei.png', skillName: '咆哮', copy: '出牌阶段使用【杀】没有次数限制。' },
  { skill: 'jizhi', name: '黄月英', title: '归隐的杰女', faction: '蜀', portrait: '/heroes/huang-yueying.png', skillName: '集智 · 奇才', copy: '普通锦囊摸一张；锦囊牌无距离限制。' },
  { skill: 'qixi', name: '甘宁', title: '锦帆游侠', faction: '吴', portrait: '/heroes/gan-ning.png', skillName: '奇袭', copy: '黑色牌可以当【过河拆桥】使用。' },
  { skill: 'biyue', name: '貂蝉', title: '绝世的舞姬', faction: '群', portrait: '/heroes/diao-chan.png', skillName: '离间 · 闭月', copy: '每回合弃一张牌，令两名男性角色决斗；结束阶段摸一张牌。' },
  { skill: 'zhiheng', name: '孙权', title: '年轻的贤君', faction: '吴', portrait: '/heroes/sun-quan.png', skillName: '制衡 · 救援', copy: '每回合换任意手牌；吴势力忠臣用桃救援时额外回复一点。' },
  { skill: 'wushuang', name: '吕布', title: '武的化身', faction: '群', portrait: '/heroes/lu-bu.png', skillName: '无双', copy: '杀与决斗要求对方连续打出两张响应牌。' },
]

function GeneralSelect() {
  const selectGeneral = useGameStore(s => s.selectGeneral)
  const selectMap = useGameStore(s => s.selectMap)
  const selectDeckMode = useGameStore(s => s.selectDeckMode)
  const mapId = useGameStore(s => s.mapId)
  const deckMode = useGameStore(s => s.deckMode)
  return <div className="overlay general-select-overlay"><section className="general-select panel">
    <span className="eyebrow">主公选将</span>
    <h1>选择本局武将</h1>
    <div className="map-options battlefield-options" aria-label="选择战场">
      <button className={mapId === 'river' ? 'active' : ''} onClick={() => selectMap('river')}><strong>双河争渡</strong><span>涉水耗力，中央桥梁是交通要道</span></button>
      <button className={mapId === 'siege' ? 'active' : ''} onClick={() => selectMap('siege')}><strong>围城夺旗</strong><span>城墙阻路，四道入口与瞭望台决定攻防</span></button>
      <button className={mapId === 'highland' ? 'active' : ''} onClick={() => selectMap('highland')}><strong>山谷伏击</strong><span>林地掩护，山壁分路，泥沼拖慢中央推进</span></button>
      <button className={mapId === 'wetland' ? 'active' : ''} onClick={() => selectMap('wetland')}><strong>泽国遗城</strong><span>中央涉水或侧翼过桥，废墟与水道改变路线</span></button>
    </div>
    <div className="map-options" aria-label="选择牌池">
      <button className={deckMode === 'standard' ? 'active' : ''} onClick={() => selectDeckMode('standard')}><strong>标准牌池 · 108 张</strong><span>标准包与 EX 牌的花色、点数及数量</span></button>
      <button className={deckMode === 'expanded' ? 'active' : ''} onClick={() => selectDeckMode('expanded')}><strong>扩展牌池 · 116 张</strong><span>加入火杀、雷杀、酒与军争锦囊</span></button>
    </div>
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
  const requiredLabel = pending.required === 'any' ? '牌' : CARD_LABEL[pending.required]
  const responses = player.hand.filter(card => pending.required === 'any' || card.kind === pending.required || (pending.effect === 'dying' && pending.target === 'player' && card.kind === 'wine') || (pending.required === 'slash' && isSlashKind(card.kind)) || (pending.effect === 'dying' && player.skills.includes('jijiu') && (card.suit === 'heart' || card.suit === 'diamond')) || (pending.required === 'slash' && player.skills.includes('wusheng') && (card.suit === 'heart' || card.suit === 'diamond')) || (player.skill === 'longdan' && ((pending.required === 'dodge' && isSlashKind(card.kind)) || (pending.required === 'slash' && card.kind === 'dodge'))) || (pending.required === 'dodge' && player.skills.includes('qingguo') && (card.suit === 'spade' || card.suit === 'club')))
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">响应时机</span>
    <h1>{pending.prompt}</h1>
    <p>{pending.effect === 'ganglie' ? `选择手牌弃置（还需 ${pending.requiredCount} 张），或选择承受伤害。` : pending.effect === 'borrowedSword' ? '选择一张【杀】打出；放弃则将武器交给锦囊使用者。' : `选择一张【${requiredLabel}】打出${(pending.requiredCount ?? 1) > 1 ? `（还需 ${pending.requiredCount} 张）` : ''}，或放弃响应并承受效果。`}</p>
    <div className="response-cards">
      {responses.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => respond(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{pending.effect === 'ganglie' ? '弃置此牌' : card.kind === pending.required ? '打出响应' : pending.effect === 'dying' ? '急救 → 桃' : player.skills.includes('wusheng') && pending.required === 'slash' && (card.suit === 'heart' || card.suit === 'diamond') ? '武圣 → 杀' : player.skills.includes('qingguo') && pending.required === 'dodge' ? '倾国 → 闪' : `龙胆 → ${requiredLabel}`}</small>
      </button>)}
      {!responses.length && <span className="no-response">{pending.effect === 'ganglie' ? '没有可弃置的手牌' : `手牌中没有【${requiredLabel}】`}</span>}
    </div>
    {(pending.effect !== 'ganglie' || pending.requiredCount === 2) && <button className="decline-response" onClick={() => respond(null)}>{pending.effect === 'ganglie' ? '承受 1 点伤害' : pending.effect === 'borrowedSword' ? '交出武器' : '放弃响应'}</button>}
  </section></div>
}

function HarvestWindow() {
  const pending = useGameStore(s => s.pendingHarvest)
  const chooseHarvest = useGameStore(s => s.chooseHarvest)
  if (!pending) return null
  return <div className="overlay response-overlay"><section className="response-panel harvest-panel panel">
    <span className="eyebrow">五谷丰登</span>
    <h1>选择一张公开牌</h1>
    <p>牌池会按照出牌者开始的座次依次选择；拿走的牌立即加入手牌。</p>
    <div className="response-cards harvest-cards">
      {pending.pool.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => chooseHarvest(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{CARD_COPY[card.kind]}</small>
      </button>)}
    </div>
  </section></div>
}

function FanjianWindow() {
  const pending = useGameStore(s => s.pendingFanjian)
  const chooseFanjianSuit = useGameStore(s => s.chooseFanjianSuit)
  const source = useGameStore(s => pending ? s.units[pending.source] : null)
  if (!pending || !source) return null
  const suits: Card['suit'][] = ['spade', 'heart', 'club', 'diamond']
  const labels: Record<Card['suit'], string> = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方片' }
  return <div className="overlay response-overlay"><section className="response-panel fanjian-panel panel">
    <span className="eyebrow">反间</span>
    <h1>{source.name}请你猜测花色</h1>
    <p>选择后才会展示并获得这张牌；猜错将受到 1 点伤害。</p>
    <div className="suit-choices">
      {suits.map(suit => <button key={suit} className={suit === 'heart' || suit === 'diamond' ? 'red' : ''} onClick={() => chooseFanjianSuit(suit)}>
        <strong>{SUIT_GLYPH[suit]}</strong><span>{labels[suit]}</span>
      </button>)}
    </div>
  </section></div>
}

function PlunderWindow() {
  const pending = useGameStore(s => s.pendingPlunder)
  const choosePlunderCard = useGameStore(s => s.choosePlunderCard)
  const target = useGameStore(s => pending ? s.units[pending.target] : null)
  if (!pending || !target) return null
  const equipment = Object.entries(target.equipment).filter((entry): entry is [string, Card] => !!entry[1])
  const slotLabel: Record<string, string> = { weapon: '武器', armor: '防具', offensiveMount: '进攻坐骑', defensiveMount: '防御坐骑' }
  return <div className="overlay response-overlay"><section className="response-panel plunder-panel panel">
    <span className="eyebrow">{pending.reason === 'feedback' ? '反馈' : pending.gain ? '顺手牵羊' : '过河拆桥'}</span>
    <h1>选择{pending.gain ? '获得' : '弃置'}{target.name}的一张牌</h1>
    <p>手牌以牌背显示；装备区为公开信息，可直接选择指定装备。</p>
    <div className="plunder-cards">
      {target.hand.map((card, index) => <button key={card.id} className="hidden-card" onClick={() => choosePlunderCard(card.id)}><strong>战</strong><span>手牌 {index + 1}</span></button>)}
      {equipment.map(([slot, card]) => <button key={card.id} className={`card ${card.kind}`} onClick={() => choosePlunderCard(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{slotLabel[slot]}</small>
      </button>)}
    </div>
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
  const canJijiang = state.units.player.identity === 'lord' && state.units.player.skills.includes('jijiang') && state.units.player.attacksUsed < slashLimit(state.units.player) && Object.values(state.units).some(unit => unit.identity === 'loyalist' && unit.faction === 'shu' && unit.hp > 0 && (unit.hand.some(card => isSlashKind(card.kind)) || (unit.skill === 'longdan' && unit.hand.some(card => card.kind === 'dodge')) || (unit.skills.includes('wusheng') && unit.hand.some(card => card.suit === 'heart' || card.suit === 'diamond'))))
  const canQixi = state.units.player.skill === 'qixi' && selectedCard && (selectedCard.suit === 'spade' || selectedCard.suit === 'club')
  const canZhiheng = state.units.player.skill === 'zhiheng' && !state.units.player.skillUsed
  const canQingnang = state.units.player.skills.includes('qingnang') && !state.units.player.skillUsed && !!selectedCard && Object.values(state.units).some(unit => unit.hp > 0 && unit.hp < unit.maxHp && (unit.id === 'player' || unit.identity === 'loyalist'))
  const canFanjian = state.units.player.skills.includes('fanjian') && !state.units.player.skillUsed && !!selectedCard
  const canJieyin = state.units.player.skills.includes('jieyin') && !state.units.player.skillUsed && state.units.player.hp < state.units.player.maxHp && state.units.player.hand.length >= 2 && Object.values(state.units).some(unit => unit.id !== 'player' && unit.hp > 0 && unit.hp < unit.maxHp && unit.gender === 'male')
  const canRende = state.units.player.skills.includes('rende') && !!selectedCard
  const canKurou = state.units.player.skills.includes('kurou') && state.units.player.hp > 0
  const canGuose = state.units.player.skills.includes('guose') && selectedCard?.suit === 'diamond'
  const canLijian = state.units.player.skills.includes('lijian') && !state.units.player.skillUsed && !!selectedCard && Object.values(state.units).filter(unit => unit.id !== 'player' && unit.hp > 0 && unit.gender === 'male').length >= 2
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
      <div className="brand"><span className="brand-mark">W</span><div><strong>WARGRID</strong><small>{state.mapId === 'siege' ? '围城夺旗' : state.mapId === 'highland' ? '山谷伏击' : state.mapId === 'wetland' ? '泽国遗城' : '双河争渡'} · {state.deckMode === 'standard' ? '标准' : '扩展'} · 第 {state.turn} 回合</small></div></div>
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
      <div className="movement"><span>{state.turnStage === 'play' ? `出牌阶段 · 移动 ${state.units.player.movement}` : state.turnStage === 'discard' ? `弃牌 ${state.discardSelection.length}/${discardRequired}` : state.turnStage}</span><div>{Array.from({ length: Math.max(3, state.units.player.movement) }, (_, index) => index + 1).map(n => <i key={n} className={state.turnStage === 'play' && n <= state.units.player.movement ? 'active' : ''} />)}</div></div>
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
        {state.turnStage === 'play' && canQingnang && <button className="secondary skill-action" onClick={() => state.activateQingnang()}><Swords />青囊</button>}
        {state.turnStage === 'play' && canFanjian && <button className={`secondary skill-action ${state.selectedAsFanjian ? 'active' : ''}`} onClick={() => state.activateFanjian()}><Swords />反间</button>}
        {state.turnStage === 'play' && canJieyin && <button className="secondary skill-action" onClick={() => state.activateJieyin()}><Swords />结姻</button>}
        {state.turnStage === 'play' && canRende && <button className={`secondary skill-action ${state.selectedAsRende ? 'active' : ''}`} onClick={() => state.activateRende()}><Swords />仁德</button>}
        {state.turnStage === 'play' && canKurou && <button className="secondary skill-action" onClick={() => state.activateKurou()}><Swords />苦肉</button>}
        {state.turnStage === 'play' && canGuose && <button className={`secondary skill-action ${state.selectedAsGuose ? 'active' : ''}`} onClick={() => state.activateGuose()}><Swords />国色</button>}
        {state.turnStage === 'play' && canLijian && <button className={`secondary skill-action ${state.lijianMode ? 'active' : ''}`} onClick={() => state.activateLijian()}><Swords />{state.lijianTargets.length ? `离间 ${state.lijianTargets.length}/2` : '离间'}</button>}
        {state.turnStage === 'play' && selectedCard?.kind === 'ironChain' && <button className="secondary" onClick={() => dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCard.id, recast: true })}><RotateCcw />重铸</button>}
        {state.turnStage === 'play' && selectedCard?.kind === 'ironChain' && !state.chainTargets.includes('player') && state.chainTargets.length < 2 && <button className="secondary" onClick={() => state.selectChainTarget('player')}><Swords />选自己</button>}
        {state.turnStage === 'play' && selectedCard?.kind === 'ironChain' && state.chainTargets.length > 0 && <button className="secondary active" onClick={() => state.playIronChain()}><Swords />结算 {state.chainTargets.length}/2</button>}
        {state.turnStage === 'play' && state.selectedCardId && <button className="secondary" onClick={() => state.selectCard(null)}><X />取消</button>}
        <button className="end-turn" disabled={state.phase !== 'player' || !discardReady} onClick={() => dispatch({ type: 'END_TURN' })}><SkipForward />{state.turnStage === 'discard' ? '确认弃牌' : '结束回合'}</button>
      </div>
    </footer>

    {!state.generalSelected && <GeneralSelect />}
    {state.generalSelected && tutorial && <Tutorial close={closeTutorial} />}
    {state.generalSelected && !tutorial && state.pendingResponse && <ResponseWindow />}
    {state.generalSelected && !tutorial && state.pendingHarvest && !state.pendingResponse && <HarvestWindow />}
    {state.generalSelected && !tutorial && state.pendingFanjian && <FanjianWindow />}
    {state.generalSelected && !tutorial && state.pendingPlunder && <PlunderWindow />}
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
