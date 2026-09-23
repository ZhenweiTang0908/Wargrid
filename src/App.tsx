import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls, Sparkles } from '@react-three/drei'
import { CircleHelp, RotateCcw, ScrollText, SkipForward, Swords, Volume2, VolumeX, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGameStore, isCellReachable, greenDragonChoices, borrowedSwordChoices } from './game/store'
import { CARD_COPY, CARD_LABEL, IDENTITY_LABEL, SUIT_GLYPH, type Card, type Faction, type GeneralSkill, type MapId, type Position, type Team, type Unit } from './types'
import { MAP_DEFINITIONS, MAP_IDS, canBorrowedSwordTarget, canSlash, combatDistance, effectiveAttackRange, isSlashKind, pathDistance, plunderableCards, samePosition, slashLimit, terrainAt } from './game/rules'
import { audioEvents } from './game/audioEvents'
import { playAudioEvents, setAudioEnabled, unlockAudio } from './audio'
import { CharacterBody } from './CharacterBody'
import { setMusicScene } from './music'
import { BattlefieldGround } from './BattlefieldGround'

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
  const colors: Record<Team, string> = { player: '#55c7ff', north: '#ef5350', east: '#ae72e8', west: '#ef9b43' }
  const color = owner ? colors[owner] : '#f2c66d'
  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.25) * .09
    if (ring.current) ring.current.scale.setScalar(pulse)
  })
  return <group position-y={.015}>
    <mesh position-y={.08} castShadow receiveShadow><cylinderGeometry args={[.34, .4, .15, 8]} /><meshStandardMaterial color="#7f7764" roughness={.95} /></mesh>
    <mesh position-y={.175} castShadow><cylinderGeometry args={[.29, .34, .055, 8]} /><meshStandardMaterial color="#b9a47b" roughness={.78} /></mesh>
    <mesh ref={ring} position-y={.215} rotation-x={-Math.PI / 2}>
      <torusGeometry args={[.25, .017, 6, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.65} />
    </mesh>
    <mesh position={[.2, .48, -.17]}><cylinderGeometry args={[.018, .023, .7, 7]} /><meshStandardMaterial color="#66503a" roughness={.9} /></mesh>
    <mesh position={[.3, .68, -.17]} rotation-z={-.18}><planeGeometry args={[.2, .29]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={.82} /></mesh>
    <mesh position-y={.24}><cylinderGeometry args={[.12, .16, .11, 8]} /><meshStandardMaterial color="#614b36" roughness={.8} /></mesh>
    <mesh position-y={.34}><coneGeometry args={[.085, .22, 7]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} transparent opacity={.82} /></mesh>
    <pointLight position-y={.35} color={color} intensity={owner ? 1.3 : .7} distance={1.6} />
    <Sparkles count={owner ? 10 : 6} scale={.65} size={1.5} speed={.32} color={color} />
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
  const map = MAP_DEFINITIONS[state.mapId]
  return (
    <group position={worldPosition(position)}>
      <mesh
        position-y={obstacle ? .42 : .028}
        rotation-x={obstacle ? 0 : -Math.PI / 2}
        scale={hovered && reachable ? 1.04 : 1}
        onPointerEnter={e => { e.stopPropagation(); setHovered(true); hoverCell(position); document.body.style.cursor = reachable || canInteract ? 'pointer' : 'default' }}
        onPointerLeave={() => { setHovered(false); hoverCell(null); document.body.style.cursor = 'default' }}
        onClick={e => { e.stopPropagation(); if (canInteract && mapObject && selectedCard) dispatch({ type: 'INTERACT', unit: 'player', objectId: mapObject.id, cardId: selectedCard.id }); else if (reachable && !occupied) dispatch({ type: 'MOVE', unit: 'player', to: position }) }}
      >
        {obstacle ? <boxGeometry args={[.98, .82, .98]} /> : <planeGeometry args={[TILE_GAP, TILE_GAP]} />}
        {obstacle ? <meshStandardMaterial color={map.obstacleColor} roughness={.92} /> : <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />}
      </mesh>
      {!obstacle && (reachable || inPath) && <mesh position-y={.018} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.98, .98]} />
        <meshBasicMaterial color={inPath ? '#6de2e3' : '#5dc5d5'} transparent opacity={inPath ? .45 : .23} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>}
      {!obstacle && reachable && <mesh position-y={.026} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.31, .335, 32]} />
        <meshBasicMaterial color="#b9f4eb" transparent opacity={.74} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>}
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
      {terrain === 'forest' && !obstacle && (state.mapId === 'winter' ? <group position={[-.12, .12, .08]}>
        <mesh position-y={.25}><cylinderGeometry args={[.045, .065, .5, 6]} /><meshStandardMaterial color="#526366" roughness={1} /></mesh>
        <mesh position-y={.48}><coneGeometry args={[.26, .52, 6]} /><meshStandardMaterial color="#3e676b" roughness={1} flatShading /></mesh>
        <mesh position-y={.73}><coneGeometry args={[.18, .38, 6]} /><meshStandardMaterial color="#638489" roughness={1} flatShading /></mesh>
        <mesh position-y={.9}><coneGeometry args={[.09, .15, 6]} /><meshStandardMaterial color="#e7eeed" roughness={.9} /></mesh>
      </group> : state.mapId === 'bamboo' ? <group position-y={.12}>
        {[[-.24, -.17, .72], [.13, .21, .86], [.28, -.22, .59]].map(([x, z, height], index) => <group key={index} position={[x, 0, z]} rotation-z={(index - 1) * .06}>
          <mesh position-y={height / 2}><cylinderGeometry args={[.028, .035, height, 6]} /><meshStandardMaterial color={index === 1 ? '#7eaa67' : '#668d55'} roughness={.82} /></mesh>
          {[.28, .5, .71].filter(y => y < height).map(y => <mesh key={y} position-y={y}><torusGeometry args={[.032, .007, 4, 6]} /><meshStandardMaterial color="#354b32" roughness={.9} /></mesh>)}
          <mesh position={[.11, height * .78, 0]} rotation-z={-.48}><coneGeometry args={[.09, .34, 5]} /><meshStandardMaterial color="#3c714b" roughness={.9} flatShading /></mesh>
          <mesh position={[-.1, height * .93, .03]} rotation-z={.56}><coneGeometry args={[.08, .28, 5]} /><meshStandardMaterial color="#52805a" roughness={.9} flatShading /></mesh>
        </group>)}
      </group> : <group position={[-.16, .13, .08]}><mesh position-y={.23}><cylinderGeometry args={[.05, .08, .4, 6]} /><meshStandardMaterial color="#5f4530" /></mesh><mesh position-y={.54}><coneGeometry args={[.25, .56, 7]} /><meshStandardMaterial color="#28553a" /></mesh></group>)}
      {terrain === 'road' && !control && <group position-y={.018}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.46, .92]} /><meshStandardMaterial color="#65543d" roughness={1} /></mesh>
        {[-.25, .02, .28].map((z, i) => <mesh key={i} position={[i % 2 ? .11 : -.09, .012, z]} rotation-x={-Math.PI / 2}><boxGeometry args={[.22, .012, .06]} /><meshStandardMaterial color="#8a7658" roughness={1} /></mesh>)}
      </group>}
      {terrain === 'water' && <group position-y={.018}>
        <WaterSurface seed={position.x + position.y * 9} />
        {[-.2, .08, .27].map((z, i) => <mesh key={i} position={[i % 2 ? .14 : -.13, .018, z]} rotation-x={-Math.PI / 2}><torusGeometry args={[.12, .012, 4, 16, Math.PI]} /><meshBasicMaterial color="#78bdd0" transparent opacity={.5} /></mesh>)}
      </group>}
      {terrain === 'bridge' && <group position-y={.018}>
        {[-.34, -.17, 0, .17, .34].map((x, index) => <mesh key={x} position={[x, .025, 0]}><boxGeometry args={[.14, .07, .9]} /><meshStandardMaterial color={index % 2 ? '#8a6740' : '#9b7549'} roughness={.88} /></mesh>)}
        {[-.38, .38].map(x => <mesh key={x} position={[x, .08, 0]}><boxGeometry args={[.05, .08, .96]} /><meshStandardMaterial color="#5c4028" roughness={.78} /></mesh>)}
      </group>}
      {terrain === 'marsh' && <group position-y={.018}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.82, .82]} /><meshStandardMaterial color="#56633b" transparent opacity={.55} roughness={.8} /></mesh>
        {[[-.24, -.16], [.18, .12], [-.05, .3]].map(([x, z], i) => <group key={i} position={[x, .04, z]}><mesh position-y={.12}><cylinderGeometry args={[.012, .02, .24, 5]} /><meshStandardMaterial color="#829457" /></mesh><mesh position={[.045, .2, 0]} rotation-z={-.45}><coneGeometry args={[.04, .16, 5]} /><meshStandardMaterial color="#a1ad69" /></mesh></group>)}
      </group>}
      {terrain === 'snow' && <group position-y={.018}>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[.84, .84]} /><meshStandardMaterial color="#e0e9e5" roughness={.96} /></mesh>
        <mesh position={[-.2, .09, .13]} scale={[1, .42, .75]}><sphereGeometry args={[.26, 8, 6]} /><meshStandardMaterial color="#f3f5ed" roughness={1} flatShading /></mesh>
        <mesh position={[.23, .065, -.2]} scale={[.8, .35, 1]}><sphereGeometry args={[.2, 8, 6]} /><meshStandardMaterial color="#cad9d8" roughness={1} flatShading /></mesh>
      </group>}
      {terrain === 'ridge' && !obstacle && <group position-y={.13}>
        <mesh position={[-.18, .17, .1]} rotation={[.2, .1, -.18]}><dodecahedronGeometry args={[.23, 0]} /><meshStandardMaterial color={state.mapId === 'winter' ? '#80969c' : '#665e50'} roughness={.95} /></mesh>
        <mesh position={[.16, .11, -.12]} rotation={[-.1, .2, .3]}><dodecahedronGeometry args={[.16, 0]} /><meshStandardMaterial color={state.mapId === 'winter' ? '#d1dfdf' : '#4d4a42'} roughness={1} /></mesh>
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
      {obstacle && state.mapId === 'bamboo' && <group position-y={.82} rotation-y={(position.x * 3 + position.y) * .18}>
        <mesh position={[-.14, .1, 0]} rotation-z={-.18} castShadow><dodecahedronGeometry args={[.4, 0]} /><meshStandardMaterial color="#737e66" roughness={1} flatShading /></mesh>
        <mesh position={[.24, .29, -.1]} rotation-z={.2} castShadow><dodecahedronGeometry args={[.31, 0]} /><meshStandardMaterial color="#4c5d4b" roughness={1} flatShading /></mesh>
        <mesh position={[-.3, .26, .2]} rotation-z={-.2}><coneGeometry args={[.14, .48, 5]} /><meshStandardMaterial color="#406344" roughness={.9} /></mesh>
      </group>}
      {obstacle && state.mapId === 'pass' && <group position-y={.82} rotation-y={(position.x * 3 + position.y * 7) * .12}>
        <mesh position-y={.36} castShadow><cylinderGeometry args={[.27, .41, 1.02, 5]} /><meshStandardMaterial color="#927960" roughness={1} flatShading /></mesh>
        <mesh position={[.07, .99, -.04]} rotation-z={.14} castShadow><coneGeometry args={[.28, .67, 5]} /><meshStandardMaterial color="#b29976" roughness={1} flatShading /></mesh>
        <mesh position={[-.24, .22, .21]} rotation-z={-.18}><dodecahedronGeometry args={[.23, 0]} /><meshStandardMaterial color="#695a4d" roughness={1} flatShading /></mesh>
        {[.13, .43, .71].map(y => <mesh key={y} position={[0, y, .29]} rotation-z={.09}><boxGeometry args={[.44, .025, .025]} /><meshStandardMaterial color="#695a4b" roughness={1} /></mesh>)}
      </group>}
      {obstacle && state.mapId === 'dockyard' && <group position-y={.82} rotation-y={(position.x + position.y) % 2 * Math.PI / 2}>
        <mesh position-y={.12} castShadow><boxGeometry args={[.84, .42, .72]} /><meshStandardMaterial color="#77513b" roughness={.94} /></mesh>
        <mesh position-y={.37} castShadow><boxGeometry args={[.68, .13, .58]} /><meshStandardMaterial color="#9a7450" roughness={.9} /></mesh>
        {[-.25, .25].map(x => <mesh key={x} position={[x, .13, .37]}><boxGeometry args={[.055, .4, .035]} /><meshStandardMaterial color="#453a35" metalness={.55} /></mesh>)}
        <mesh position={[0, .44, 0]}><boxGeometry args={[.05, .1, .48]} /><meshStandardMaterial color="#503d32" roughness={.9} /></mesh>
      </group>}
      {obstacle && state.mapId === 'desert' && <group position-y={.82} rotation-y={(position.x * 3 + position.y) * .28}>
        <mesh position-y={.21} rotation-z={-.12} castShadow><coneGeometry args={[.43, .72, 5]} /><meshStandardMaterial color="#bc9568" roughness={1} flatShading /></mesh>
        <mesh position={[.24, .13, -.16]} rotation-z={.26} castShadow><dodecahedronGeometry args={[.31, 0]} /><meshStandardMaterial color="#80674e" roughness={1} flatShading /></mesh>
      </group>}
      {obstacle && state.mapId === 'maple' && <group position-y={.82} rotation-y={(position.x + position.y) % 2 * Math.PI / 2}>
        <mesh position-y={.21} castShadow><boxGeometry args={[.8, .42, .68]} /><meshStandardMaterial color="#705744" roughness={1} /></mesh>
        <mesh position={[.19, .49, -.12]} rotation-z={-.19} castShadow><boxGeometry args={[.34, .4, .42]} /><meshStandardMaterial color="#977359" roughness={1} /></mesh>
        <mesh position={[-.27, .42, .19]} rotation-z={.12}><boxGeometry args={[.24, .33, .31]} /><meshStandardMaterial color="#4e3e35" roughness={1} /></mesh>
      </group>}
      {obstacle && state.mapId === 'winter' && <group position-y={.82} rotation-y={(position.x * 3 + position.y) * .21}>
        <mesh position-y={.25} castShadow><dodecahedronGeometry args={[.44, 0]} /><meshStandardMaterial color="#607985" roughness={.96} flatShading /></mesh>
        <mesh position={[.1, .57, -.08]} rotation-z={.15} castShadow><coneGeometry args={[.36, .65, 5]} /><meshStandardMaterial color="#829ca3" roughness={1} flatShading /></mesh>
        <mesh position={[-.12, .72, -.02]} rotation-z={.15}><coneGeometry args={[.24, .28, 5]} /><meshStandardMaterial color="#e8eeea" roughness={.9} flatShading /></mesh>
      </group>}
      {obstacle && state.mapId === 'terraces' && <group position-y={.82} rotation-y={(position.x + position.y) % 2 * Math.PI / 2}>
        <mesh position-y={.13} castShadow><boxGeometry args={[.86, .3, .82]} /><meshStandardMaterial color="#746c51" roughness={1} /></mesh>
        <mesh position={[-.08, .39, -.06]} castShadow><boxGeometry args={[.7, .22, .68]} /><meshStandardMaterial color="#8a8060" roughness={1} /></mesh>
        <mesh position={[.08, .6, .03]} castShadow><boxGeometry args={[.47, .17, .48]} /><meshStandardMaterial color="#a39770" roughness={1} /></mesh>
        <mesh position={[-.24, .48, .24]}><coneGeometry args={[.11, .3, 5]} /><meshStandardMaterial color="#49694b" roughness={1} /></mesh>
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

function UnitPiece({ team, previewUnit }: { team: Team; previewUnit?: Unit }) {
  const liveUnit = useGameStore(s => s.units[team])
  const unit = previewUnit ?? liveUnit
  const selectedCardId = useGameStore(s => s.selectedCardId)
  const selectedAsSlash = useGameStore(s => s.selectedAsSlash)
  const state = useGameStore()
  const dispatch = useGameStore(s => s.dispatch)
  const resetAnimation = useGameStore(s => s.resetAnimation)
  const group = useRef<THREE.Group>(null)
  const moveQueue = useRef<THREE.Vector3[]>([])
  const target = useMemo(() => new THREE.Vector3(...(previewUnit ? [0, 0, 0] as [number, number, number] : worldPosition(unit.position))), [previewUnit, unit.position])
  const pieceColors: Record<GeneralSkill, string> = { qianxun: '#397b72', lianying: '#397b72', guose: '#c76a78', liuli: '#c76a78', luoshen: '#7776a7', qingguo: '#7776a7', keji: '#326e6c', kurou: '#9a3a2e', tieqi: '#d7dde0', mashu: '#d7dde0', rende: '#477b4b', jijiang: '#477b4b', wusheng: '#2f8a68', longdan: '#b6cbd0', ganglie: '#a84635', feedback: '#78528d', guicai: '#78528d', jianxiong: '#8c342d', hujia: '#8c342d', yiji: '#667fa4', tiandu: '#667fa4', qingnang: '#79936c', jijiu: '#79936c', yingzi: '#b64c43', fanjian: '#b64c43', guanxing: '#d7d5c5', kongcheng: '#d7d5c5', tuxi: '#49747c', luoyi: '#8b633d', jieyin: '#b94e58', xiaoji: '#b94e58', paoxiao: '#8f3529', jizhi: '#c59b43', qicai: '#c59b43', qixi: '#2a8c91', biyue: '#a94f79', lijian: '#a94f79', zhiheng: '#3c9291', jiuyuan: '#3c9291', wushuang: '#9d3028' }
  const darkColors: Record<GeneralSkill, string> = { qianxun: '#183c38', lianying: '#183c38', guose: '#542d39', liuli: '#542d39', luoshen: '#292a50', qingguo: '#292a50', keji: '#183a3a', kurou: '#3f201c', tieqi: '#34475a', mashu: '#34475a', rende: '#244629', jijiang: '#244629', wusheng: '#174d3a', longdan: '#526f78', ganglie: '#61251e', feedback: '#3d294b', guicai: '#3d294b', jianxiong: '#271b23', hujia: '#271b23', yiji: '#25324c', tiandu: '#25324c', qingnang: '#34442f', jijiu: '#34442f', yingzi: '#54231f', fanjian: '#54231f', guanxing: '#31565e', kongcheng: '#31565e', tuxi: '#1c3438', luoyi: '#38271d', jieyin: '#4f2630', xiaoji: '#4f2630', paoxiao: '#381713', jizhi: '#385f59', qicai: '#385f59', qixi: '#17464b', biyue: '#51233b', lijian: '#51233b', zhiheng: '#193f42', jiuyuan: '#193f42', wushuang: '#351311' }
  const color = pieceColors[unit.skill], darkColor = darkColors[unit.skill]
  const factionAccent: Record<Faction, string> = { wei: '#607fae', shu: '#59a66c', wu: '#d15b4f', qun: '#9a8a74' }
  const accent = factionAccent[unit.faction]
  const selectedKind = state.qingnangMode || state.jieyinMode ? undefined : selectedAsSlash ? 'slash' : state.selectedAsDismantle ? 'dismantle' : state.selectedAsGuose ? 'indulgence' : state.units.player.hand.find(c => c.id === selectedCardId)?.kind
  const attackSource = selectedAsSlash && Object.values(state.units.player.equipment).some(card => card?.id === selectedCardId)
    ? { ...state.units.player, equipment: Object.fromEntries(Object.entries(state.units.player.equipment).filter(([, card]) => card?.id !== selectedCardId)) as Unit['equipment'] } : state.units.player
  const canLijianTarget = state.lijianMode && team !== 'player' && unit.hp > 0 && unit.gender === 'male' && !state.lijianTargets.includes(team)
  const canQingnangTarget = state.qingnangMode && !!selectedCardId && unit.hp > 0 && unit.hp < unit.maxHp
  const canJieyinTarget = state.jieyinMode && state.jieyinSelection.length === 2 && team !== 'player' && unit.hp > 0 && unit.hp < unit.maxHp && unit.gender === 'male'
  const lijianSelected = state.lijianTargets.includes(team)
  const canChainTarget = selectedKind === 'ironChain' && unit.hp > 0
  const chainSelected = state.chainTargets.includes(team)
  const canHalberdTarget = !!state.pendingHalberd && team !== 'player' && unit.hp > 0 && canSlash(state, attackSource, unit)
  const halberdSelected = !!state.pendingHalberd?.targets.includes(team)
  const borrowedWielder = state.borrowedSwordWielder
  const canBorrowedWielder = selectedKind === 'borrowedSword' && team !== 'player' && !borrowedWielder && !!unit.equipment.weapon && Object.values(state.units).some(victim => canBorrowedSwordTarget(state, unit, victim))
  const canBorrowedVictim = selectedKind === 'borrowedSword' && !!borrowedWielder && canBorrowedSwordTarget(state, state.units[borrowedWielder], unit)
  const canTarget = canQingnangTarget || canJieyinTarget || canLijianTarget || (team !== 'player' && unit.hp > 0 && !!selectedCardId && !!selectedKind && !(unit.skills.includes('qianxun') && (selectedKind === 'snatch' || selectedKind === 'indulgence')) && (
    (selectedKind === 'slash' && canSlash(state, attackSource, unit)) ||
    (selectedKind === 'duel' && !(unit.skills.includes('kongcheng') && unit.hand.length === 0)) || (selectedKind === 'dismantle' && plunderableCards(unit).length > 0) ||
    canBorrowedWielder || canBorrowedVictim ||
    selectedKind === 'indulgence' || selectedKind === 'fireAttack' || selectedKind === 'ironChain' ||
    (selectedKind === 'snatch' && plunderableCards(unit).length > 0 && (state.units.player.skills.includes('qicai') || combatDistance(state, state.units.player, unit) <= 1)) || state.selectedAsFanjian || state.selectedAsRende
  ))

  useEffect(() => {
    if (previewUnit) return
    if (unit.movePath) moveQueue.current.push(...unit.movePath.map(position => new THREE.Vector3(...worldPosition(position))))
    else { moveQueue.current = []; if (group.current) group.current.position.copy(target) }
  }, [previewUnit, unit.movePath, target])

  useEffect(() => {
    if (previewUnit || unit.animation === 'idle') return
    const timer = window.setTimeout(() => resetAnimation(team), unit.animation === 'move' ? Math.max(700, (unit.movePath?.length ?? 1) * 220) : 480)
    return () => window.clearTimeout(timer)
  }, [previewUnit, unit.animation, resetAnimation, team])

  useFrame(({ clock }, delta) => {
    if (!group.current) return
    const waypoint = moveQueue.current[0] ?? target
    const distance = Math.hypot(waypoint.x - group.current.position.x, waypoint.z - group.current.position.z)
    const fraction = distance ? Math.min(1, delta * 5 / distance) : 1
    group.current.position.x += (waypoint.x - group.current.position.x) * fraction
    group.current.position.z += (waypoint.z - group.current.position.z) * fraction
    if (distance < .025 || fraction === 1) moveQueue.current.shift()
    const idle = Math.sin(clock.elapsedTime * 2.2 + (team === 'player' ? 0 : team === 'north' ? 1 : team === 'east' ? 2 : 3)) * .035
    group.current.position.y = idle + (unit.animation === 'heal' ? Math.abs(Math.sin(clock.elapsedTime * 10)) * .12 : 0)
    if (previewUnit) { group.current.rotation.y = Math.sin(clock.elapsedTime * .45) * .38; return }
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
      onClick={previewUnit ? undefined : e => {
        e.stopPropagation()
        if (canQingnangTarget) state.chooseQingnangTarget(team)
        else if (canJieyinTarget) state.chooseJieyinTarget(team)
        else if (canHalberdTarget) state.selectHalberdTarget(team)
        else if (canChainTarget) state.selectChainTarget(team)
        else if (canLijianTarget) state.selectLijianTarget(team)
        else if (canBorrowedWielder) state.selectBorrowedSwordWielder(team)
        else if (canBorrowedVictim && selectedCardId && borrowedWielder) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: borrowedWielder, targets: [borrowedWielder, team] })
        else if (canTarget && selectedCardId) dispatch({ type: 'PLAY_CARD', unit: 'player', cardId: selectedCardId, target: team, asSlash: selectedAsSlash, asDismantle: state.selectedAsDismantle, asFanjian: state.selectedAsFanjian, asRende: state.selectedAsRende, asGuose: state.selectedAsGuose, materialIds: state.spearMode ? state.spearSelection : undefined, lordAssist: state.jijiangSource ?? undefined })
      }}
      onPointerEnter={previewUnit ? undefined : () => { if (canTarget || canChainTarget || canHalberdTarget || canBorrowedVictim) document.body.style.cursor = 'crosshair' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      {(canTarget || canBorrowedVictim || canHalberdTarget) && (
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
      {halberdSelected && <mesh position-y={.09} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[.8, .88, 32]} />
        <meshBasicMaterial color="#f0bd63" transparent opacity={.98} side={THREE.DoubleSide} />
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
      <CharacterBody unit={unit} color={color} darkColor={darkColor} accent={accent} />
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
        {[-1, 1].map(side => <group key={`rende-armor-${side}`}>
          <mesh position={[side * .38, 1.02, .02]} rotation-z={side * -.35}><dodecahedronGeometry args={[.23, 0]} /><meshStandardMaterial color="#c8a44e" metalness={.86} roughness={.28} /></mesh>
          <mesh position={[side * .25, 1.62, 0]} rotation-z={side * -.35}><boxGeometry args={[.06, .32, .1]} /><meshStandardMaterial color="#d2b364" metalness={.9} /></mesh>
          <mesh position={[side * .37, .65, -.24]} rotation-z={side * .28}><boxGeometry args={[.24, .9, .06]} /><meshStandardMaterial color="#28634b" roughness={.8} side={THREE.DoubleSide} /></mesh>
        </group>)}
        <mesh position={[0, .85, .32]}><boxGeometry args={[.38, .56, .07]} /><meshStandardMaterial color="#2a735a" metalness={.45} /></mesh>
        <mesh position={[0, .95, .365]}><octahedronGeometry args={[.12]} /><meshStandardMaterial color="#cba650" metalness={.9} /></mesh>
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
        {[-1, 1].map(side => <group key={`jianxiong-crown-${side}`}>
          <mesh position={[side * .2, 1.78, 0]} rotation-z={side * -.16}><coneGeometry args={[.065, .39, 5]} /><meshStandardMaterial color="#c7a04d" metalness={.88} /></mesh>
          <mesh position={[side * .37, 1.53, 0]}><boxGeometry args={[.33, .045, .07]} /><meshStandardMaterial color="#c7a04d" metalness={.88} /></mesh>
          <mesh position={[side * .42, .98, .04]} rotation-z={side * -.25}><dodecahedronGeometry args={[.22, 0]} /><meshStandardMaterial color="#c2a055" metalness={.86} roughness={.26} /></mesh>
          <mesh position={[side * .41, .53, -.25]} rotation-z={side * .25}><boxGeometry args={[.26, .92, .06]} /><meshStandardMaterial color="#70292c" roughness={.8} side={THREE.DoubleSide} /></mesh>
        </group>)}
        <mesh position={[0, .86, .33]}><boxGeometry args={[.42, .59, .08]} /><meshStandardMaterial color="#262936" metalness={.52} /></mesh>
        <mesh position={[0, .96, .38]}><octahedronGeometry args={[.13]} /><meshStandardMaterial color="#bd9848" metalness={.9} /></mesh>
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
        {[-1, 1].map(side => <group key={side} position={[side * .43, 1.12, -.13]} rotation-z={side * -.32}>
          <mesh position={[side * .13, .14, 0]}><boxGeometry args={[.48, .075, .12]} /><meshStandardMaterial color="#8b6137" roughness={.8} /></mesh>
          <mesh position={[side * .32, .2, 0]} rotation-z={side * .55}><boxGeometry args={[.42, .25, .045]} /><meshStandardMaterial color="#c1a96c" metalness={.3} roughness={.65} /></mesh>
          <mesh position={[side * .39, .21, .04]}><sphereGeometry args={[.075, 8, 6]} /><meshStandardMaterial color="#d7aa4d" metalness={.85} /></mesh>
        </group>)}
        <mesh position={[0, .89, .32]}><torusGeometry args={[.22, .035, 6, 14]} /><meshStandardMaterial color="#c9953d" metalness={.85} /></mesh>
        {[0, 1, 2, 3].map(i => <mesh key={i} position={[0, .89, .34]} rotation-z={i * Math.PI / 4}><boxGeometry args={[.035, .37, .025]} /><meshStandardMaterial color="#d9c695" metalness={.55} /></mesh>)}
        <mesh position={[0, .89, .37]}><sphereGeometry args={[.065, 10, 8]} /><meshStandardMaterial color="#53aca1" emissive="#174d48" emissiveIntensity={.5} /></mesh>
      </>}
      {unit.skill === 'qixi' && <>
        {[[-.31, 1.02], [.31, 1.02], [-.22, .78]].map(([x, y], i) => <mesh key={i} position={[x, y, .22]}><sphereGeometry args={[.08, 10, 8]} /><meshStandardMaterial color="#d5a847" metalness={.85} emissive="#71510d" emissiveIntensity={.35} /></mesh>)}
        <group position={[.45, .86, 0]} rotation-z={-.48}><mesh position-y={.28}><cylinderGeometry args={[.035, .035, 1.45, 7]} /><meshStandardMaterial color="#45291b" /></mesh><mesh position={[0, 1.02, 0]} rotation-z={-.25}><boxGeometry args={[.16, .75, .055]} /><meshStandardMaterial color="#aeb8b8" metalness={.95} /></mesh></group>
        <mesh position={[0, 1.43, .2]}><boxGeometry args={[.48, .085, .14]} /><meshStandardMaterial color="#a43e37" roughness={.85} /></mesh>
        <mesh position={[-.32, 1.22, -.12]} rotation-z={-.3}><boxGeometry args={[.075, .55, .045]} /><meshStandardMaterial color="#a43e37" roughness={.9} /></mesh>
        <mesh position={[-.16, .78, .33]} rotation-z={-.32}><torusGeometry args={[.36, .035, 6, 16, Math.PI * 1.05]} /><meshStandardMaterial color="#b9a57e" roughness={.9} /></mesh>
        <mesh position={[.15, .8, .34]}><boxGeometry args={[.21, .24, .065]} /><meshStandardMaterial color="#8d5030" roughness={.8} /></mesh>
        <mesh position={[.15, .8, .39]}><torusGeometry args={[.075, .018, 6, 12]} /><meshStandardMaterial color="#d7aa4d" metalness={.85} /></mesh>
      </>}
      {unit.skill === 'biyue' && <>
        <mesh position={[0, 1.48, 0]}><torusGeometry args={[.26, .035, 7, 16, Math.PI]} /><meshStandardMaterial color="#d9b8c8" metalness={.7} /></mesh>
        {[-.2, .2].map((x, i) => <mesh key={i} position={[x, 1.55, 0]}><sphereGeometry args={[.075, 10, 8]} /><meshStandardMaterial color="#b73e62" emissive="#65162c" emissiveIntensity={.5} /></mesh>)}
        <group position={[-.42, .86, .08]} rotation-z={.38}><mesh position-y={.45}><boxGeometry args={[.32, .82, .055]} /><meshStandardMaterial color="#7f354f" roughness={.6} /></mesh></group>
        {[-1, 1].map(side => <group key={side} position={[side * .31, 1.1, -.08]} rotation-z={side * .35}>
          <mesh position={[side * .07, -.38, 0]}><boxGeometry args={[.15, .9, .045]} /><meshStandardMaterial color={side < 0 ? '#d698b5' : '#8f4d91'} roughness={.7} side={THREE.DoubleSide} /></mesh>
          <mesh position={[side * .1, -.76, .02]}><sphereGeometry args={[.07, 8, 6]} /><meshStandardMaterial color="#d8a953" metalness={.8} /></mesh>
        </group>)}
        <mesh position={[0, 1.66, .02]} rotation-z={Math.PI / 4}><boxGeometry args={[.46, .035, .035]} /><meshStandardMaterial color="#ddb969" metalness={.8} /></mesh>
        <mesh position={[.22, 1.83, .02]}><sphereGeometry args={[.075, 8, 6]} /><meshStandardMaterial color="#b94477" emissive="#6e244c" emissiveIntensity={.45} /></mesh>
      </>}
      {unit.skill === 'zhiheng' && <>
        <mesh position={[0, 1.5, 0]}><boxGeometry args={[.48, .18, .34]} /><meshStandardMaterial color="#b99646" metalness={.8} /></mesh>
        <mesh position={[0, 1.66, 0]}><sphereGeometry args={[.1, 10, 8]} /><meshStandardMaterial color="#5fbaa4" emissive="#1b6559" emissiveIntensity={.6} /></mesh>
        {[-1, 1].map(side => <group key={`zhiheng-armor-${side}`}>
          <mesh position={[side * .41, .99, .02]} rotation-z={side * -.3}><dodecahedronGeometry args={[.21, 0]} /><meshStandardMaterial color="#bd9b50" metalness={.85} roughness={.3} /></mesh>
          <mesh position={[side * .3, 1.51, 0]}><boxGeometry args={[.06, .29, .07]} /><meshStandardMaterial color="#d2b567" metalness={.89} /></mesh>
          <mesh position={[side * .43, .55, -.25]} rotation-z={side * .28}><boxGeometry args={[.22, .9, .06]} /><meshStandardMaterial color="#1c6866" roughness={.78} side={THREE.DoubleSide} /></mesh>
        </group>)}
        <mesh position={[0, .85, .33]}><boxGeometry args={[.4, .55, .07]} /><meshStandardMaterial color="#245b60" metalness={.6} /></mesh>
        <mesh position={[0, .94, .38]}><octahedronGeometry args={[.11]} /><meshStandardMaterial color="#55b9a9" metalness={.55} emissive="#174d48" emissiveIntensity={.35} /></mesh>
        <group position={[.45, .82, 0]} rotation-z={-.32}><mesh position-y={.26}><cylinderGeometry args={[.03, .03, 1.55, 7]} /><meshStandardMaterial color="#5b3922" /></mesh><mesh position={[0, 1.05, 0]}><boxGeometry args={[.13, .68, .055]} /><meshStandardMaterial color="#d0d7cf" metalness={.95} /></mesh></group>
      </>}
      {unit.skill === 'wushuang' && <>
        {[-.16, .16].map((x, i) => <mesh key={i} position={[x, 1.76, 0]} rotation-z={x < 0 ? -.14 : .14}><capsuleGeometry args={[.028, .62, 3, 6]} /><meshStandardMaterial color="#a22d27" roughness={.7} /></mesh>)}
        <mesh position={[0, 1.46, 0]}><coneGeometry args={[.3, .3, 6]} /><meshStandardMaterial color="#251719" metalness={.7} /></mesh>
        <group position={[-.48, .82, 0]} rotation-z={.22}><mesh position-y={.3}><cylinderGeometry args={[.035, .035, 1.9, 7]} /><meshStandardMaterial color="#251817" /></mesh><mesh position={[0, 1.3, 0]}><boxGeometry args={[.25, .68, .07]} /><meshStandardMaterial color="#b9b7ad" metalness={.95} /></mesh></group>
      </>}
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
          <BattlefieldGround />
          {cells.map(p => <Tile key={`${p.x}-${p.y}`} position={p} />)}
          <UnitPiece team="player" />
          <UnitPiece team="north" />
          <UnitPiece team="east" />
          <UnitPiece team="west" />
        </group>
        <WorldScenery />
        <MapAtmosphere />
        <ContactShadows opacity={.65} scale={11} blur={2.4} far={5} color="#000000" />
      </Suspense>
      <OrbitControls makeDefault target={[0, .1, 0]} minDistance={13} maxDistance={18} minPolarAngle={.55} maxPolarAngle={1.12} minAzimuthAngle={-.8} maxAzimuthAngle={.8} enablePan={false} />
    </Canvas>
  )
}

function WorldScenery() {
  const mapId = useGameStore(s => s.mapId)
  if (mapId === 'terraces') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.5, -2.7, -.8, 1.1, 3, 4.6].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.25 + index % 2 * .24), 0, z]}>
      <mesh position-y={.34} castShadow><boxGeometry args={[.9, .68, 1.05]} /><meshStandardMaterial color={index % 2 ? '#666e4c' : '#7d7955'} roughness={1} /></mesh>
      <mesh position={[side * .16, .75, -.1]} castShadow><boxGeometry args={[.58, .2, .75]} /><meshStandardMaterial color="#9a9168" roughness={1} /></mesh>
      <mesh position={[-side * .24, 1.01, .19]}><cylinderGeometry args={[.06, .09, .53, 6]} /><meshStandardMaterial color="#4b5036" roughness={1} /></mesh>
      <mesh position={[-side * .24, 1.42, .19]}><coneGeometry args={[.3, .54, 6]} /><meshStandardMaterial color="#3e6545" roughness={1} flatShading /></mesh>
    </group>))}
  </group>
  if (mapId === 'winter') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.6, -2.9, -1.1, .9, 2.9, 4.6].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.2 + index % 2 * .35), 0, z]}>
      <mesh position-y={.52}><cylinderGeometry args={[.09, .13, 1.04, 6]} /><meshStandardMaterial color="#4b5b57" roughness={1} /></mesh>
      <mesh position-y={1.05} castShadow><coneGeometry args={[.46, 1.08, 6]} /><meshStandardMaterial color={index % 2 ? '#365b61' : '#466b69'} roughness={1} flatShading /></mesh>
      <mesh position-y={1.53} castShadow><coneGeometry args={[.32, .85, 6]} /><meshStandardMaterial color="#5d7978" roughness={1} flatShading /></mesh>
      <mesh position-y={1.9}><coneGeometry args={[.17, .32, 6]} /><meshStandardMaterial color="#e8efed" roughness={.88} flatShading /></mesh>
    </group>))}
    {[-1, 1].map(side => <group key={side} position={[side * 5.65, 0, side * 4.5]}>
      <mesh position-y={.28}><boxGeometry args={[.95, .55, .82]} /><meshStandardMaterial color="#75858a" roughness={1} /></mesh>
      <mesh position-y={.68} rotation-y={Math.PI / 4}><coneGeometry args={[.73, .42, 4]} /><meshStandardMaterial color="#e5ece9" roughness={.88} /></mesh>
      <mesh position={[.25, .88, 0]}><cylinderGeometry args={[.025, .025, .58, 6]} /><meshStandardMaterial color="#4e5c5f" /></mesh>
      <mesh position={[.41, 1.08, 0]}><planeGeometry args={[.3, .2]} /><meshStandardMaterial color={side < 0 ? '#b55243' : '#3a8294'} side={THREE.DoubleSide} /></mesh>
    </group>)}
  </group>
  if (mapId === 'maple') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.5, -2.7, -.7, 1.4, 3.6].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.25 + index % 2 * .35), 0, z]} rotation-y={index * .57}>
      <mesh position-y={.75} castShadow><cylinderGeometry args={[.12, .18, 1.5, 6]} /><meshStandardMaterial color="#4a3024" roughness={1} /></mesh>
      <mesh position-y={1.7} castShadow><dodecahedronGeometry args={[.68, 0]} /><meshStandardMaterial color={index % 2 ? '#a34b2d' : '#be7137'} roughness={1} flatShading /></mesh>
      <mesh position={[.3, 1.34, -.18]} castShadow><dodecahedronGeometry args={[.4, 0]} /><meshStandardMaterial color={index % 2 ? '#ca7e37' : '#873c2c'} roughness={1} flatShading /></mesh>
    </group>))}
    {[-1, 1].map(side => <group key={side} position={[side * 5.7, 0, side * 4.5]}>
      <mesh position-y={.42}><boxGeometry args={[1.1, .85, .75]} /><meshStandardMaterial color="#775743" roughness={1} /></mesh>
      <mesh position-y={1.05} rotation-y={Math.PI / 4}><coneGeometry args={[.78, .48, 4]} /><meshStandardMaterial color="#59392e" roughness={1} /></mesh>
    </group>)}
  </group>
  if (mapId === 'desert') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.6, -2.5, .2, 2.8, 4.7].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.15 + index % 2 * .45), 0, z]} rotation-y={index * .37}>
      <mesh position-y={.3} castShadow><coneGeometry args={[.73, .65, 6]} /><meshStandardMaterial color={index % 2 ? '#a98259' : '#bd9565'} roughness={1} flatShading /></mesh>
      <mesh position={[side * .3, .18, .19]}><dodecahedronGeometry args={[.29, 0]} /><meshStandardMaterial color="#765d49" roughness={1} flatShading /></mesh>
    </group>))}
    {[-1, 1].map(side => <group key={side} position={[side * 5.72, 0, side * 2.3]}>
      <mesh position-y={.04} rotation-x={-Math.PI / 2}><circleGeometry args={[.92, 20]} /><meshStandardMaterial color="#3d858c" roughness={.36} /></mesh>
      {[[-.54, -.12], [.53, .28]].map(([x, z], index) => <group key={index} position={[x, 0, z]}>
        <mesh position-y={.65} rotation-z={index ? -.12 : .14}><cylinderGeometry args={[.075, .12, 1.3, 6]} /><meshStandardMaterial color="#6d4930" roughness={1} /></mesh>
        <mesh position-y={1.33}><coneGeometry args={[.47, .78, 7]} /><meshStandardMaterial color="#486947" roughness={1} flatShading /></mesh>
      </group>)}
    </group>)}
  </group>
  if (mapId === 'dockyard') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4, -1.6, 1.6, 4].map((z, index) => <group key={`${side}-${index}`} position={[side * 5.45, 0, z]}>
      <mesh position-y={.28} castShadow><boxGeometry args={[.8, .55, .75]} /><meshStandardMaterial color={index % 2 ? '#705340' : '#866043'} roughness={.92} /></mesh>
      <mesh position-y={.6}><boxGeometry args={[.62, .1, .57]} /><meshStandardMaterial color="#aa8054" roughness={.88} /></mesh>
      <mesh position={[side * .44, .65, 0]}><cylinderGeometry args={[.035, .04, 1.3, 6]} /><meshStandardMaterial color="#4d3428" roughness={.9} /></mesh>
      <mesh position={[side * .58, 1.02, 0]} rotation-z={side * .18}><boxGeometry args={[.36, .55, .045]} /><meshStandardMaterial color="#a74531" roughness={.82} side={THREE.DoubleSide} /></mesh>
    </group>))}
  </group>
  if (mapId === 'pass') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.7, -2.5, 0, 2.5, 4.7].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.3 + index % 2 * .2), 0, z]} rotation-y={index * .31}>
      <mesh position-y={.72} castShadow><cylinderGeometry args={[.47, .72, 1.6, 5]} /><meshStandardMaterial color={index % 2 ? '#80664f' : '#6e5c4e'} roughness={1} flatShading /></mesh>
      <mesh position={[.08, 1.75, -.08]} rotation-z={index % 2 ? -.12 : .16} castShadow><coneGeometry args={[.42, 1.16, 5]} /><meshStandardMaterial color="#a28767" roughness={1} flatShading /></mesh>
      <mesh position={[-.28, .28, .32]}><dodecahedronGeometry args={[.36, 0]} /><meshStandardMaterial color="#564c43" roughness={1} flatShading /></mesh>
    </group>))}
    {[-1, 1].map(side => <group key={side} position={[side * 5.65, 0, 0]}>
      <mesh position-y={.36}><cylinderGeometry args={[.25, .35, .72, 6]} /><meshStandardMaterial color="#665342" roughness={1} /></mesh>
      <mesh position-y={.82}><coneGeometry args={[.17, .5, 5]} /><meshStandardMaterial color="#9e784e" roughness={1} /></mesh>
      <mesh position={[0, 1.12, 0]}><sphereGeometry args={[.1, 8, 6]} /><meshStandardMaterial color="#ffbb68" emissive="#c45d22" emissiveIntensity={1.4} /></mesh>
      <pointLight position-y={1.12} color="#ff9a56" intensity={2.4} distance={3} />
    </group>)}
  </group>
  if (mapId === 'bamboo') return <group position-y={-.15}>
    {[-1, 1].flatMap(side => [-4.6, -3, -1.5, 0, 1.5, 3, 4.6].map((z, index) => <group key={`${side}-${index}`} position={[side * (5.1 + index % 2 * .27), 0, z]} rotation-z={side * (index % 3 - 1) * .04}>
      <mesh position-y={1.12}><cylinderGeometry args={[.075, .09, 2.24, 7]} /><meshStandardMaterial color={index % 2 ? '#789c61' : '#668d56'} roughness={.84} /></mesh>
      {[.48, 1.02, 1.58, 2.04].map(y => <mesh key={y} position-y={y}><torusGeometry args={[.084, .014, 5, 7]} /><meshStandardMaterial color="#344c30" roughness={.9} /></mesh>)}
      <mesh position={[side * -.19, 1.65, 0]} rotation-z={side * -.55}><coneGeometry args={[.17, .72, 5]} /><meshStandardMaterial color="#316448" roughness={.94} flatShading /></mesh>
      <mesh position={[side * .18, 2.02, .06]} rotation-z={side * .5}><coneGeometry args={[.14, .63, 5]} /><meshStandardMaterial color="#4b8055" roughness={.94} flatShading /></mesh>
    </group>))}
    {[-5.25, 5.25].map((z, index) => <group key={z} position={[0, 0, z]}>
      <mesh position-y={.24}><boxGeometry args={[1.4, .46, .7]} /><meshStandardMaterial color="#625f49" roughness={1} /></mesh>
      <mesh position={[0, .65, 0]} rotation-y={Math.PI / 4}><coneGeometry args={[.66, .53, 4]} /><meshStandardMaterial color="#3b4d38" roughness={1} /></mesh>
      <mesh position={[0, 1.07, 0]}><cylinderGeometry args={[.025, .03, .48, 6]} /><meshStandardMaterial color="#876d3e" /></mesh>
      <mesh position={[.2, 1.24, 0]}><planeGeometry args={[.38, .25]} /><meshStandardMaterial color={index ? '#a5493a' : '#387d75'} side={THREE.DoubleSide} /></mesh>
    </group>)}
  </group>
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

function MapAtmosphere() {
  const mapId = useGameStore(s => s.mapId)
  const presets: Record<MapId, { color: string; count: number; size: number; speed: number; scale: [number, number, number]; y: number }> = {
    river: { color: '#83d6e4', count: 34, size: 1.8, speed: .28, scale: [10, 1.6, 10], y: .55 },
    siege: { color: '#e5a06d', count: 20, size: 1.5, speed: .2, scale: [9, 2.8, 9], y: 1.5 },
    highland: { color: '#bfd7c0', count: 18, size: 1.4, speed: .12, scale: [11, 2.2, 11], y: 1.2 },
    wetland: { color: '#9ad6bd', count: 30, size: 1.5, speed: .2, scale: [10, 1.8, 10], y: .7 },
    bamboo: { color: '#d4ea9b', count: 28, size: 1.6, speed: .3, scale: [10, 2.5, 10], y: 1.1 },
    pass: { color: '#efb67a', count: 16, size: 1.4, speed: .16, scale: [10, 2.4, 10], y: 1.3 },
    dockyard: { color: '#9fd4df', count: 32, size: 1.7, speed: .18, scale: [10, 1.7, 10], y: .8 },
    desert: { color: '#f0c98b', count: 26, size: 1.6, speed: .46, scale: [12, 1.5, 12], y: .55 },
    maple: { color: '#e98743', count: 24, size: 1.9, speed: .42, scale: [10, 2.6, 10], y: 1.2 },
    winter: { color: '#edf8ff', count: 54, size: 2, speed: .34, scale: [11, 4, 11], y: 2.8 },
    terraces: { color: '#f1db8f', count: 20, size: 1.5, speed: .18, scale: [10, 2.2, 10], y: 1.5 },
  }
  const preset = presets[mapId]
  return <group position-y={preset.y}><Sparkles count={preset.count} size={preset.size} speed={preset.speed} scale={preset.scale} color={preset.color} noise={.7} /></group>
}

function Hearts({ hp, max }: { hp: number; max: number }) {
  return <div className="hearts" aria-label={`${hp}/${max} 体力`}>{Array.from({ length: max }, (_, i) => <span key={i} className={i < hp ? 'full' : ''}>◆</span>)}</div>
}

function PlayerStatus({ team, onInspect }: { team: Team; onInspect: (team: Team, portrait: string, skillText: string) => void }) {
  const unit = useGameStore(s => s.units[team])
  const score = useGameStore(s => s.scores[team])
  const portraits: Record<GeneralSkill, string> = { qianxun: '/heroes/lu-xun.png', lianying: '/heroes/lu-xun.png', guose: '/heroes/da-qiao.png', liuli: '/heroes/da-qiao.png', luoshen: '/heroes/zhen-ji.png', qingguo: '/heroes/zhen-ji.png', keji: '/heroes/lu-meng.png', kurou: '/heroes/huang-gai.png', tieqi: '/heroes/ma-chao.png', mashu: '/heroes/ma-chao.png', rende: '/heroes/liu-bei.png', jijiang: '/heroes/liu-bei.png', wusheng: '/heroes/guan-yun.png', longdan: '/heroes/zhao-ling.png', ganglie: '/heroes/xiahou-lie.png', feedback: '/heroes/sima-xuan.png', guicai: '/heroes/sima-xuan.png', jianxiong: '/heroes/cao-cao.png', hujia: '/heroes/cao-cao.png', yiji: '/heroes/guo-jia.png', tiandu: '/heroes/guo-jia.png', qingnang: '/heroes/hua-tuo.png', jijiu: '/heroes/hua-tuo.png', yingzi: '/heroes/zhou-yu.png', fanjian: '/heroes/zhou-yu.png', guanxing: '/heroes/zhuge-liang.png', kongcheng: '/heroes/zhuge-liang.png', tuxi: '/heroes/zhang-liao.png', luoyi: '/heroes/xu-chu.png', jieyin: '/heroes/sun-shangxiang.png', xiaoji: '/heroes/sun-shangxiang.png', paoxiao: '/heroes/zhang-fei.png', jizhi: '/heroes/huang-yueying.png', qicai: '/heroes/huang-yueying.png', qixi: '/heroes/gan-ning.png', biyue: '/heroes/diao-chan.png', lijian: '/heroes/diao-chan.png', zhiheng: '/heroes/sun-quan.png', jiuyuan: '/heroes/sun-quan.png', wushuang: '/heroes/lu-bu.png' }
  const skillCopy = { rende: '仁德/激将 · 赠牌回血/蜀将代杀', jijiang: '激将 · 蜀势力忠臣代出杀', hujia: '护驾 · 魏势力忠臣代出闪', wusheng: '武圣 · 红牌可当杀', longdan: '龙胆 · 杀闪互化', ganglie: '刚烈 · 受伤后判定反击', feedback: '反馈/鬼才 · 受伤获牌/改判', jianxiong: '奸雄/护驾 · 受伤获牌/魏将代闪', yiji: '天妒/遗计 · 获判定牌/受伤摸二', tiandu: '天妒 · 获得判定牌', qingnang: '青囊/急救 · 弃牌治疗/红牌救人', jijiu: '急救 · 红牌可当桃', yingzi: '英姿/反间 · 摸三张/猜花色', fanjian: '反间 · 赠牌猜花色', guanxing: '观星/空城 · 调牌堆/免杀与决斗', kongcheng: '空城 · 无手牌免杀与决斗', tuxi: '突袭 · 从两名角色处获得手牌', luoyi: '裸衣 · 少摸一张并强化杀/决斗', jieyin: '结姻/枭姬 · 双疗/失装备摸牌', xiaoji: '枭姬 · 失去装备摸两张', paoxiao: '咆哮 · 出杀无次数限制', jizhi: '集智/奇才 · 摸牌/锦囊无距离', qixi: '奇袭 · 黑牌可当过河拆桥', biyue: '离间/闭月 · 男性决斗/结束摸牌', lijian: '离间 · 弃牌令两名男性决斗', zhiheng: '制衡/救援 · 换牌/吴将桃强化', jiuyuan: '救援 · 吴将桃额外回复一点', wushuang: '无双 · 杀与决斗需双响应', guicai: '鬼才 · 使用手牌修改判定', qicai: '奇才 · 锦囊无距离限制' } as const
  const factionLabel: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' }
  const lordSkill = unit.identity === 'lord' ? unit.skills.includes('jijiang') ? ' · 激将' : unit.skills.includes('hujia') ? ' · 护驾' : '' : ''
  const skillText = unit.skill === 'qianxun' ? '谦逊/连营 · 免顺手乐/空手摸牌' : unit.skill === 'lianying' ? '连营 · 失最后手牌摸一张' : unit.skill === 'guose' ? '国色/流离 · 方片乐/转移杀' : unit.skill === 'liuli' ? '流离 · 弃牌转移杀' : unit.skill === 'luoshen' ? '洛神/倾国 · 黑判获牌/黑牌作闪' : unit.skill === 'qingguo' ? '倾国 · 黑色手牌可当闪' : unit.skill === 'keji' ? '克己 · 未出杀则跳过弃牌' : unit.skill === 'kurou' ? '苦肉 · 失去体力并摸两张' : unit.skill === 'tieqi' ? '马术/铁骑 · 距离-1/红判禁闪' : unit.skill === 'mashu' ? '马术 · 计算距离时始终-1' : skillCopy[unit.skill]
  const inspect = () => onInspect(team, portraits[unit.skill], `${skillText}${lordSkill}`)
  return (
    <section className={`status ${team}`} role="button" tabIndex={0} aria-label={`查看${unit.name}的立绘、装备与状态`} onClick={inspect} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect() } }}>
      <div className="avatar"><img src={portraits[unit.skill]} alt="" /><span>{team === 'player' ? '主' : unit.revealed ? IDENTITY_LABEL[unit.identity].slice(0, 1) : '?'}</span></div>
      <div className="status-copy">
        <div className="name-row"><strong>{unit.name}</strong><span>{factionLabel[unit.faction]} · {team === 'player' || unit.revealed ? IDENTITY_LABEL[unit.identity] : '身份未知'}</span></div>
        <Hearts hp={unit.hp} max={unit.maxHp} />
        <div className="status-meta"><span>手牌 {unit.hand.length}</span><span>据点 {score}/3</span>{unit.chained && <span>⛓ 连环</span>}</div>
        <div className="equipment-line">装备 {Object.values(unit.equipment).filter(Boolean).length}/4 · 判定 {unit.judgement.length} · 点击详情</div>
        <div className="skill-line">{skillText}{lordSkill}</div>
      </div>
    </section>
  )
}

function UnitDetails({ team, portrait, skillText, close }: { team: Team; portrait: string; skillText: string; close: () => void }) {
  const state = useGameStore()
  const unit = state.units[team]
  const slots = [
    { key: 'weapon', name: '武器', empty: '未装备武器' },
    { key: 'armor', name: '防具', empty: '未装备防具' },
    { key: 'offensiveMount', name: '进攻坐骑', empty: '未装备进攻坐骑' },
    { key: 'defensiveMount', name: '防御坐骑', empty: '未装备防御坐骑' },
  ] as const
  const states = [
    unit.chained && '铁索连环', unit.drunk && '酒劲：下一次杀伤害增加', unit.luoyiActive && '裸衣：杀与决斗伤害增加',
    unit.hp <= 1 && unit.hp > 0 && '濒危', unit.hp <= 0 && '阵亡',
  ].filter(Boolean)
  return <div className="overlay unit-detail-overlay" onClick={close}><section className={`unit-detail panel ${team}`} onClick={event => event.stopPropagation()} aria-label={`${unit.name}武将详情`}>
    <button className="icon-button close" onClick={close} aria-label="关闭武将详情"><X /></button>
    <div className="unit-detail-art">
      <img src={portrait} alt={`${unit.name}原画参考`} />
      <Canvas className="unit-detail-canvas" shadows dpr={[1, 1.5]} camera={{ position: [0, 1.25, 4.3], fov: 34 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={2.1} />
        <directionalLight position={[2.5, 4, 3]} intensity={3.8} color="#fff0cf" />
        <pointLight position={[-2, 1.4, -2]} intensity={8} distance={7} color={team === 'east' ? '#db5a45' : '#55b6c6'} />
        <OrbitControls target={[0, .82, 0]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.5} maxPolarAngle={Math.PI / 2.1} />
        <UnitPiece team={team} previewUnit={unit} />
      </Canvas>
      <div><span>{unit.title}</span><strong>{unit.name}</strong></div>
    </div>
    <div className="unit-detail-info">
      <span className="eyebrow">武将档案 · {unit.revealed || team === 'player' ? IDENTITY_LABEL[unit.identity] : '身份未知'}</span>
      <h1>{unit.name}</h1>
      <div className="detail-vitals"><div><b>{unit.hp}/{unit.maxHp}</b><span>体力</span></div><div><b>{unit.hand.length}</b><span>手牌</span></div><div><b>{unit.movement}</b><span>移动力</span></div><div><b>{state.scores[team]}/3</b><span>据点</span></div></div>
      <div className="detail-section-title">装备栏 <small>攻击范围 {effectiveAttackRange(state, unit)} · 已出杀 {unit.attacksUsed}{Number.isFinite(slashLimit(unit)) ? `/${slashLimit(unit)}` : '/∞'}</small></div>
      <div className="detail-equipment">{slots.map(slot => { const card = unit.equipment[slot.key]; return <div className={card ? 'filled' : ''} key={slot.key}><span>{slot.name}</span><strong>{card ? CARD_LABEL[card.kind] : slot.empty}</strong><small>{card ? `${SUIT_GLYPH[card.suit]} ${card.rank} · ${CARD_COPY[card.kind]}` : '空槽位'}</small></div> })}</div>
      <div className="detail-section-title">状态与判定</div>
      <div className="detail-tags">{states.length ? states.map(value => <span key={String(value)}>{value}</span>) : <span>无异常状态</span>}{unit.judgement.map(card => <span key={card.id}>判定 · {CARD_LABEL[card.kind]} {SUIT_GLYPH[card.suit]}{card.rank}</span>)}</div>
      <div className="detail-section-title">武将技</div><p className="detail-skills">{skillText}</p>
    </div>
  </section></div>
}

function CardView({ card, selected, equipped = false }: { card: Card; selected: boolean; equipped?: boolean }) {
  const selectCard = useGameStore(s => s.selectCard)
  const toggleDiscard = useGameStore(s => s.toggleDiscard)
  const state = useGameStore()
  const discarding = state.phase === 'player' && state.turnStage === 'discard'
  const red = card.suit === 'heart' || card.suit === 'diamond'
  const disabled = !discarding && (state.phase !== 'player' || (!state.zhihengMode && !(state.selectedAsGuose && card.suit === 'diamond') && !(state.selectedAsSlash && state.units.player.skills.includes('wusheng') && red) && ((card.kind === 'peach' && state.units.player.hp >= state.units.player.maxHp) || (isSlashKind(card.kind) && state.units.player.attacksUsed >= slashLimit(state.units.player)) || (card.kind === 'wine' && state.units.player.wineUsed))))
  return (
    <button className={`card ${card.kind} ${selected ? 'selected' : ''} ${discarding ? 'discarding' : ''}`} disabled={disabled} onClick={() => discarding ? toggleDiscard(card.id) : selectCard(card.id)}>
      <span className={`card-suit ${red ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong>
      <small>{equipped ? `装备 · ${CARD_COPY[card.kind]}` : CARD_COPY[card.kind]}</small>
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
      <div><b>02</b><strong>战棋</strong><p>选将前可选择 {MAP_IDS.length} 张战场和标准或扩展牌池。每回合获得 3 点移动力，从官道开始回合则获得 4 点；涉水、泥沼与深雪耗 2 点，桥梁只耗 1 点。森林提供掩护；{deckMode === 'expanded' ? '扩展牌池中，森林火焰伤害 +1，水域火焰伤害 -1，水域和泥沼的雷电伤害 +1；' : ''}山脊射程 +1，瞭望台射程 +2；营地结束补牌，受伤时在村落结束回合可回复体力。邻接设施后选一张手牌再点击：军需箱弃一摸二，医庐回血，战鼓补充移动与出杀机会，烽燧公开最近角色的身份；所有设施每轮重新补给。</p></div>
      <div><b>03</b><strong>牌局</strong><p>选中【杀】后，棋盘红圈显示当前有效攻击范围；击杀反贼摸三张；忠臣可发动护驾；遭遇杀与群体锦囊时亲自响应。</p></div>
    </div>
    <button className="primary" onClick={close}>进入战场</button>
  </section></div>
}

const GENERAL_OPTIONS: { skill: GeneralSkill; name: string; title: string; faction: string; portrait: string; skillName: string; copy: string }[] = [
  { skill: 'qianxun', name: '陆逊', title: '儒生雄才', faction: '吴', portrait: '/heroes/lu-xun.png', skillName: '谦逊 · 连营', copy: '不能成为顺手牵羊和乐不思蜀的目标；失去最后一张手牌后摸一张牌。' },
  { skill: 'guose', name: '大乔', title: '矜持之花', faction: '吴', portrait: '/heroes/da-qiao.png', skillName: '国色 · 流离', copy: '方片牌可当【乐不思蜀】；成为杀目标时弃牌，将杀转移给攻击范围内其他角色。' },
  { skill: 'luoshen', name: '甄姬', title: '薄幸的美人', faction: '魏', portrait: '/heroes/zhen-ji.png', skillName: '洛神 · 倾国', copy: '准备阶段可反复判定：黑色牌收入手牌，之后自行决定是否继续；黑色手牌可以当【闪】。' },
  { skill: 'keji', name: '吕蒙', title: '白衣渡江', faction: '吴', portrait: '/heroes/lu-meng.png', skillName: '克己', copy: '若本回合没有使用【杀】，结束出牌时跳过弃牌阶段。' },
  { skill: 'kurou', name: '黄盖', title: '轻身为国', faction: '吴', portrait: '/heroes/huang-gai.png', skillName: '苦肉', copy: '出牌阶段可失去 1 点体力并摸两张牌，且可以连续发动。' },
  { skill: 'tieqi', name: '马超', title: '一骑当千', faction: '蜀', portrait: '/heroes/ma-chao.png', skillName: '马术 · 铁骑', copy: '与其他角色的距离始终 -1；使用杀时红色判定令目标不能使用闪。' },
  { skill: 'rende', name: '刘备', title: '乱世的枭雄', faction: '蜀', portrait: '/heroes/liu-bei.png', skillName: '仁德 · 激将', copy: '可将任意手牌交给其他角色；每回合累计给出两张时回复体力。' },
  { skill: 'wusheng', name: '关羽', title: '美髯公', faction: '蜀', portrait: '/heroes/guan-yun.png', skillName: '武圣', copy: '红色牌可以当【杀】使用。' },
  { skill: 'longdan', name: '赵云', title: '少年将军', faction: '蜀', portrait: '/heroes/zhao-ling.png', skillName: '龙胆', copy: '【杀】与【闪】可以相互转化。' },
  { skill: 'ganglie', name: '夏侯惇', title: '独眼的罗刹', faction: '魏', portrait: '/heroes/xiahou-lie.png', skillName: '刚烈', copy: '受伤后判定，反击伤害来源。' },
  { skill: 'feedback', name: '司马懿', title: '狼顾之鬼', faction: '魏', portrait: '/heroes/sima-xuan.png', skillName: '反馈 · 鬼才', copy: '受伤后获得来源牌；判定时可选择一张手牌改判。' },
  { skill: 'jianxiong', name: '曹操', title: '魏武帝', faction: '魏', portrait: '/heroes/cao-cao.png', skillName: '奸雄 · 护驾', copy: '受到伤害后获得造成伤害的牌；魏势力忠臣可替你出闪。' },
  { skill: 'yiji', name: '郭嘉', title: '早终的先知', faction: '魏', portrait: '/heroes/guo-jia.png', skillName: '天妒 · 遗计', copy: '获得自己的判定牌；每受到一次伤害摸两张牌。' },
  { skill: 'qingnang', name: '华佗', title: '神医', faction: '群', portrait: '/heroes/hua-tuo.png', skillName: '青囊 · 急救', copy: '每回合弃一张手牌治疗任意受伤角色；回合外红牌可当【桃】。' },
  { skill: 'yingzi', name: '周瑜', title: '大都督', faction: '吴', portrait: '/heroes/zhou-yu.png', skillName: '英姿 · 反间', copy: '摸牌阶段摸三张；每回合赠出一张牌让目标猜花色。' },
  { skill: 'guanxing', name: '诸葛亮', title: '迟暮的丞相', faction: '蜀', portrait: '/heroes/zhuge-liang.png', skillName: '观星 · 空城', copy: '准备阶段观看牌堆顶并安排至牌堆顶或底；没有手牌时不能成为杀或决斗目标。' },
  { skill: 'tuxi', name: '张辽', title: '前将军', faction: '魏', portrait: '/heroes/zhang-liao.png', skillName: '突袭', copy: '摸牌阶段可选一至两名有手牌的其他角色，各获得一张暗置手牌，取代正常摸牌。' },
  { skill: 'luoyi', name: '许褚', title: '虎痴', faction: '魏', portrait: '/heroes/xu-chu.png', skillName: '裸衣', copy: '摸牌阶段可选择少摸一张，使本回合【杀】与【决斗】伤害增加 1。' },
  { skill: 'jieyin', name: '孙尚香', title: '弓腰姬', faction: '吴', portrait: '/heroes/sun-shangxiang.png', skillName: '结姻 · 枭姬', copy: '弃两牌与受伤男性各回复体力；失去装备后摸两张牌。' },
  { skill: 'paoxiao', name: '张飞', title: '万夫不当', faction: '蜀', portrait: '/heroes/zhang-fei.png', skillName: '咆哮', copy: '出牌阶段使用【杀】没有次数限制。' },
  { skill: 'jizhi', name: '黄月英', title: '归隐的杰女', faction: '蜀', portrait: '/heroes/huang-yueying.png', skillName: '集智 · 奇才', copy: '普通锦囊摸一张；锦囊牌无距离限制。' },
  { skill: 'qixi', name: '甘宁', title: '锦帆游侠', faction: '吴', portrait: '/heroes/gan-ning.png', skillName: '奇袭', copy: '黑色牌可以当【过河拆桥】使用。' },
  { skill: 'biyue', name: '貂蝉', title: '绝世的舞姬', faction: '群', portrait: '/heroes/diao-chan.png', skillName: '离间 · 闭月', copy: '每回合弃一张牌，令两名男性角色决斗；结束阶段摸一张牌。' },
  { skill: 'zhiheng', name: '孙权', title: '年轻的贤君', faction: '吴', portrait: '/heroes/sun-quan.png', skillName: '制衡 · 救援', copy: '每回合换任意手牌；吴势力忠臣用桃救援时额外回复一点。' },
  { skill: 'wushuang', name: '吕布', title: '武的化身', faction: '群', portrait: '/heroes/lu-bu.png', skillName: '无双', copy: '杀与决斗要求对方连续打出两张响应牌。' },
]

const MAP_LORE: Record<MapId, string> = {
  river: '秋汛未退，两军留下的断旗仍挂在桥头。谁先守住渡口，谁就能截断对岸粮道。',
  siege: '城门烧毁后，守军退上残垣。夜里还听得见更鼓，却已分不清来自哪一方。',
  highland: '斥候的马铃在山谷中忽然断了声。雾散之前，伏兵与援军都在寻找同一条小路。',
  wetland: '旧城沉入芦苇与浅水，只有残桥记得商旅来往的方向。军令要在涨潮前送到。',
  bamboo: '竹叶掩住马蹄印，驿卒的书信却散在古道旁。密报还在，只是不知落入谁手。',
  pass: '栈道下是深谷，上面只容一骑通行。烽烟已越过关头，守关的人却尚未撤走。',
  dockyard: '战船烧剩半截龙骨，江风仍把焦木味吹向岸边。船坞中藏着最后一批军资。',
  desert: '沙驿的水囊挂在空马槽旁。穿过盐沼的队伍都说看见了绿洲，却少有人回来。',
  maple: '旧寨的红枫被火烤成了黑色，旗杆却还立着。有人相信山中的援军终会到来。',
  winter: '雪埋住了烽道，巡卒沿着半截车辙寻找哨塔。山口那盏灯已三夜未熄。',
  terraces: '云岭田埂层层向上，谷仓的钥匙失踪于战前一夜。两军都想先登上望台。',
}

function GeneralSelect() {
  const selectGeneral = useGameStore(s => s.selectGeneral)
  const selectMap = useGameStore(s => s.selectMap)
  const selectDeckMode = useGameStore(s => s.selectDeckMode)
  const player = useGameStore(s => s.units.player)
  const mapId = useGameStore(s => s.mapId)
  const deckMode = useGameStore(s => s.deckMode)
  const [previewSkill, setPreviewSkill] = useState<GeneralSkill>('wusheng')
  const option = GENERAL_OPTIONS.find(candidate => candidate.skill === previewSkill) ?? GENERAL_OPTIONS[0]
  const previewUnit = useMemo<Unit>(() => ({ ...player, name: option.name, title: option.title, skill: option.skill, skills: [option.skill], faction: option.faction === '魏' ? 'wei' : option.faction === '蜀' ? 'shu' : option.faction === '吴' ? 'wu' : 'qun', gender: ['大乔', '甄姬', '孙尚香', '黄月英', '貂蝉'].includes(option.name) ? 'female' : 'male', hp: 4, maxHp: 4, equipment: {}, judgement: [], animation: 'idle' }), [option, player])
  return <div className="overlay general-select-overlay"><section className="general-select panel">
    <span className="eyebrow">主公选将</span>
    <h1>选择本局武将</h1>
    <div className="general-preview">
      <div className="general-preview-stage" aria-label={`${option.name}的 3D 武将预览`}>
        <img className="general-preview-art" src={option.portrait} alt="" aria-hidden="true" decoding="async" />
        <Canvas dpr={[1, 1.4]} camera={{ position: [0, 1.36, 4.15], fov: 35 }} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={2.2} />
          <directionalLight position={[2, 4, 3]} intensity={3.3} color="#fff0cf" />
          <pointLight position={[-2, 1, -2]} intensity={8} distance={7} color="#5fb2ba" />
          <OrbitControls target={[0, 1.15, 0]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.3} maxPolarAngle={Math.PI / 2.3} />
          <UnitPiece team="player" previewUnit={previewUnit} />
        </Canvas>
      </div>
      <div className="general-preview-info"><span>{option.faction} · 3D 棋盘模型</span><strong>{option.name}</strong><small>{option.title} · {option.skillName}</small><p>{option.copy}</p><button className="primary" onClick={() => selectGeneral(option.skill)}>确认选择 {option.name}</button></div>
    </div>
    <div className="battlefield-selection-label">选择战场 <span>左右滑动查看更多</span></div>
    <div className="map-options battlefield-options" aria-label="选择战场">
      {MAP_IDS.map(id => <button key={id} className={mapId === id ? 'active' : ''} onClick={() => selectMap(id)}><strong>{MAP_DEFINITIONS[id].name}</strong><span>{MAP_DEFINITIONS[id].description}</span></button>)}
    </div>
    <p className="battlefield-lore">{MAP_LORE[mapId]}</p>
    <div className="map-options" aria-label="选择牌池">
      <button className={deckMode === 'standard' ? 'active' : ''} onClick={() => selectDeckMode('standard')}><strong>标准牌池 · 108 张</strong><span>标准包与 EX 牌的花色、点数及数量</span></button>
      <button className={deckMode === 'expanded' ? 'active' : ''} onClick={() => selectDeckMode('expanded')}><strong>扩展牌池 · 116 张</strong><span>加入火杀、雷杀、酒与军争锦囊</span></button>
    </div>
    <div className="general-grid">
      {GENERAL_OPTIONS.map(option => <button key={option.skill} className={`general-option ${option.skill}${previewSkill === option.skill ? ' active' : ''}`} onClick={() => setPreviewSkill(option.skill)} aria-pressed={previewSkill === option.skill}>
        <img src={option.portrait} alt={`${option.name}武将原画`} loading="lazy" decoding="async" />
        <span className="faction">{option.faction}</span>
        <div><strong>{option.name}</strong><small>{option.title}</small><b>{option.skillName}</b><p>{option.copy}</p></div>
      </button>)}
    </div>
  </section></div>
}

function ResponseWindow() {
  const state = useGameStore()
  const pending = useGameStore(s => s.pendingResponse)
  const player = useGameStore(s => s.units.player)
  const currentUnit = useGameStore(s => s.currentUnit)
  const attackerWeapon = useGameStore(s => s.pendingResponse ? s.units[s.pendingResponse.source].equipment.weapon?.kind : undefined)
  const respond = useGameStore(s => s.respond)
  const activateBagua = useGameStore(s => s.activateBagua)
  if (!pending) return null
  const requiredLabel = pending.required === 'any' ? '牌' : CARD_LABEL[pending.required]
  const responseEquipment = pending.effect === 'dying' && currentUnit !== 'player' && player.skills.includes('jijiu') || pending.required === 'slash' && player.skills.includes('wusheng')
  const responses = pending.effect === 'borrowedSword' ? borrowedSwordChoices(state, pending.source, 'player') : [...player.hand, ...(responseEquipment ? Object.values(player.equipment).filter((card): card is Card => !!card) : [])].filter(card => pending.required === 'any' || card.kind === pending.required || (pending.effect === 'dying' && pending.target === 'player' && card.kind === 'wine') || (pending.required === 'slash' && isSlashKind(card.kind)) || (pending.effect === 'dying' && currentUnit !== 'player' && player.skills.includes('jijiu') && (card.suit === 'heart' || card.suit === 'diamond')) || (pending.required === 'slash' && player.skills.includes('wusheng') && (card.suit === 'heart' || card.suit === 'diamond')) || (player.skill === 'longdan' && ((pending.required === 'dodge' && isSlashKind(card.kind)) || (pending.required === 'slash' && card.kind === 'dodge'))) || (pending.required === 'dodge' && player.skills.includes('qingguo') && (card.suit === 'spade' || card.suit === 'club')))
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">响应时机</span>
    <h1>{pending.prompt}</h1>
    <p>{pending.effect === 'ganglie' ? `选择手牌弃置（还需 ${pending.requiredCount} 张），或选择承受伤害。` : pending.effect === 'borrowedSword' ? '选择一张【杀】打出；放弃则将武器交给锦囊使用者。' : `选择一张【${requiredLabel}】打出${(pending.requiredCount ?? 1) > 1 ? `（还需 ${pending.requiredCount} 张）` : ''}，或放弃响应并承受效果。`}</p>
    <div className="response-cards">
      {responses.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => respond(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{pending.effect === 'ganglie' ? '弃置此牌' : card.kind === pending.required ? '打出响应' : pending.effect === 'dying' ? `${player.hand.some(held => held.id === card.id) ? '手牌' : '装备'} · 急救 → 桃` : player.skills.includes('wusheng') && pending.required === 'slash' && (card.suit === 'heart' || card.suit === 'diamond') ? `${player.hand.some(held => held.id === card.id) ? '手牌' : '装备'} · 武圣 → 杀` : player.skills.includes('qingguo') && pending.required === 'dodge' ? '倾国 → 闪' : `龙胆 → ${requiredLabel}`}</small>
      </button>)}
      {!responses.length && <span className="no-response">{pending.effect === 'ganglie' ? '没有可弃置的手牌' : `没有可用的【${requiredLabel}】`}</span>}
    </div>
    {((pending.effect === 'slash' && attackerWeapon !== 'qinggang') || pending.effect === 'arrows') && player.equipment.armor?.kind === 'bagua' && !pending.armorChecked && <button className="decline-response" onClick={activateBagua}>发动【八卦阵】判定：红色视为打出【闪】</button>}
    {(pending.effect !== 'ganglie' || pending.requiredCount === 2) && <button className="decline-response" onClick={() => respond(null)}>{pending.effect === 'ganglie' ? '承受 1 点伤害' : pending.effect === 'borrowedSword' ? '交出武器' : '放弃响应'}</button>}
  </section></div>
}

function JudgementWindow() {
  const pending = useGameStore(s => s.pendingJudgement)
  const player = useGameStore(s => s.units.player)
  const owner = useGameStore(s => pending ? s.units[pending.team] : null)
  const chooseJudgementCard = useGameStore(s => s.chooseJudgementCard)
  if (!pending || !owner) return null
  const original = pending.original
  const lightning = pending.delayed.kind === 'lightning'
  const outcome = (card: Card) => lightning
    ? card.suit === 'spade' && card.rank >= 2 && card.rank <= 9 ? '命中：受到 3 点雷电伤害' : '未命中：传给下一位武将'
    : card.suit === 'heart' ? '判定通过' : '跳过出牌阶段'
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">鬼才 · 判定响应</span>
    <h1>{owner.name}的【{lightning ? '闪电' : '乐不思蜀'}】</h1>
    <p>当前判定：{SUIT_GLYPH[original.suit]} {original.rank}，{outcome(original)}。选择一张手牌替换，或保留当前结果。</p>
    <div className="response-cards">
      {player.hand.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => chooseJudgementCard(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{outcome(card)}</small>
      </button>)}
    </div>
    <button className="decline-response" onClick={() => chooseJudgementCard(null)}>保留原判定</button>
  </section></div>
}

function LuoshenWindow() {
  const pending = useGameStore(s => s.pendingLuoshen)
  const chooseLuoshen = useGameStore(s => s.chooseLuoshen)
  if (!pending) return null
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">准备阶段 · 洛神</span>
    <h1>{pending.gained ? `已获得 ${pending.gained} 张黑色判定牌` : '是否发动【洛神】？'}</h1>
    <p>每次判定为黑色便获得该牌，并可决定是否继续；判定为红色时结束【洛神】。结束后正常进入摸牌阶段。</p>
    <div className="suit-choices">
      <button onClick={() => chooseLuoshen(true)}><strong>判</strong><span>{pending.gained ? '继续判定' : '发动洛神'}</span></button>
      <button onClick={() => chooseLuoshen(false)}><strong>止</strong><span>{pending.gained ? '收手' : '跳过洛神'}</span></button>
    </div>
  </section></div>
}

function GuanxingWindow() {
  const pending = useGameStore(s => s.pendingGuanxing)
  const assign = useGameStore(s => s.assignGuanxing)
  const finish = useGameStore(s => s.finishGuanxing)
  if (!pending) return null
  const placed = pending.top.length + pending.bottom.length
  const cardFace = (card: Card, subtitle: string) => <>
    <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
    <strong>{CARD_LABEL[card.kind]}</strong><small>{subtitle}</small>
  </>
  return <div className="overlay response-overlay"><section className="response-panel guanxing-panel panel">
    <span className="eyebrow">准备阶段 · 观星</span>
    <h1>安排牌堆顶与牌堆底</h1>
    <p>依次选择牌放到顶部或底部。顶部从左到右最先被判定、摸取；底部从左到右依次沉入牌堆。已放置 {placed}/{pending.original.length} 张。</p>
    <div className="guanxing-section"><b>待安排</b><div className="guanxing-row">
      {pending.pool.map(card => <div className="guanxing-choice" key={card.id}>
        <div className={`card ${card.kind}`}>{cardFace(card, CARD_COPY[card.kind])}</div>
        <div><button onClick={() => assign(card.id, 'top')}>置顶</button><button onClick={() => assign(card.id, 'bottom')}>置底</button></div>
      </div>)}
      {!pending.pool.length && <span className="no-response">所有牌已安排</span>}
    </div></div>
    <div className="guanxing-section"><b>牌堆顶 · 左边最先摸到</b><div className="guanxing-row">
      {pending.top.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => assign(card.id, 'pool')}>{cardFace(card, '点击撤回')}</button>)}
      {!pending.top.length && <span className="no-response">暂无</span>}
    </div></div>
    <div className="guanxing-section"><b>牌堆底</b><div className="guanxing-row">
      {pending.bottom.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => assign(card.id, 'pool')}>{cardFace(card, '点击撤回')}</button>)}
      {!pending.bottom.length && <span className="no-response">暂无</span>}
    </div></div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => finish(true)}>保留原顺序</button><button className="primary" disabled={!!pending.pool.length} onClick={() => finish(false)}>确认安排</button></div>
  </section></div>
}

function TuxiWindow() {
  const pending = useGameStore(s => s.pendingTuxi)
  const units = useGameStore(s => s.units)
  const selectTarget = useGameStore(s => s.selectTuxiTarget)
  const finish = useGameStore(s => s.finishTuxi)
  if (!pending) return null
  const targets = Object.values(units).filter(unit => unit.id !== 'player' && unit.hp > 0 && unit.hand.length)
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">摸牌阶段 · 突袭</span>
    <h1>选择一至两名角色</h1>
    <p>从每位目标的暗置手牌中随机获得一张，取代本次正常摸牌。也可以不发动，改为摸两张牌。</p>
    <div className="tuxi-options">
      {targets.map(unit => <button key={unit.id} className={pending.targets.includes(unit.id) ? 'active' : ''} onClick={() => selectTarget(unit.id)}>
        <strong>{unit.name}</strong><span>手牌 {unit.hand.length} 张</span><small>{pending.targets.includes(unit.id) ? '已选择' : '选择目标'}</small>
      </button>)}
    </div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => finish(false)}>正常摸两张</button><button className="primary" disabled={!pending.targets.length} onClick={() => finish(true)}>发动突袭 {pending.targets.length}/2</button></div>
  </section></div>
}

function HalberdWindow() {
  const state = useGameStore()
  const pending = state.pendingHalberd
  const player = state.units.player
  const selectTarget = useGameStore(s => s.selectHalberdTarget)
  const confirm = useGameStore(s => s.confirmHalberd)
  const cancel = useGameStore(s => s.cancelHalberd)
  if (!pending) return null
  const targets = Object.values(state.units).filter(unit => unit.id !== 'player' && unit.hp > 0 && canSlash(state, player, unit))
  return <div className="overlay response-overlay halberd-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">武器技能 · 方天画戟</span>
    <h1>选择多目标【杀】</h1>
    <p>这张【杀】是本回合最后一张手牌，可以攻击至多三名攻击范围内的角色。点击棋盘武将或下方名单调整目标。</p>
    <div className="tuxi-options">
      {targets.map(unit => <button key={unit.id} className={pending.targets.includes(unit.id) ? 'active' : ''} onClick={() => selectTarget(unit.id)}>
        <strong>{unit.name}</strong><span>攻击距离 {combatDistance(state, player, unit)}</span><small>{pending.targets.includes(unit.id) ? '已选择' : '选择目标'}</small>
      </button>)}
    </div>
    <div className="guanxing-actions"><button className="decline-response" onClick={cancel}>取消出牌</button><button className="primary" disabled={!pending.targets.length} onClick={confirm}>结算 {pending.targets.length}/3</button></div>
  </section></div>
}

function QilinWindow() {
  const pending = useGameStore(s => s.pendingQilin)
  const target = useGameStore(s => pending ? s.units[pending.target] : null)
  const choose = useGameStore(s => s.chooseQilinMount)
  if (!pending || !target) return null
  const choices: { slot: 'offensiveMount' | 'defensiveMount'; label: string; card: Card }[] = [
    target.equipment.offensiveMount ? { slot: 'offensiveMount', label: '进攻坐骑', card: target.equipment.offensiveMount } : null,
    target.equipment.defensiveMount ? { slot: 'defensiveMount', label: '防御坐骑', card: target.equipment.defensiveMount } : null,
  ].filter((choice): choice is { slot: 'offensiveMount' | 'defensiveMount'; label: string; card: Card } => !!choice)
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">武器技能 · 麒麟弓</span>
    <h1>选择弃置{target.name}的坐骑</h1>
    <p>【麒麟弓】命中后可以弃置目标的一匹坐骑；若两匹坐骑同时存在，请选择其中一匹。</p>
    <div className="response-cards">{choices.map(choice => <button key={choice.slot} className={`card ${choice.card.kind}`} onClick={() => choose(choice.slot)}>
      <span className={`card-suit ${choice.card.suit === 'heart' || choice.card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[choice.card.suit]} {choice.card.rank}</span>
      <strong>{CARD_LABEL[choice.card.kind]}</strong><small>{choice.label} · 弃置并结算伤害</small>
    </button>)}</div>
    <button className="decline-response" onClick={() => choose(null)}>不弃置坐骑</button>
  </section></div>
}

function YijiWindow() {
  const pending = useGameStore(s => s.pendingYiji)
  const units = useGameStore(s => s.units)
  const turnOrder = useGameStore(s => s.turnOrder)
  const choose = useGameStore(s => s.chooseYijiRecipient)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (selected && !pending?.cards.some(card => card.id === selected)) setSelected(null)
  }, [pending, selected])
  if (!pending) return null
  const targets = turnOrder.map(team => units[team]).filter(unit => unit.hp > 0)
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">受伤后 · 遗计</span>
    <h1>分配遗计牌</h1>
    <p>选择一张牌，再选择任意存活角色交给他。剩余 {pending.cards.length} 张。</p>
    <div className="response-cards">{pending.cards.map(card => <button key={card.id} className={`card ${card.kind} ${selected === card.id ? 'selected' : ''}`} onClick={() => setSelected(current => current === card.id ? null : card.id)}>
      <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong><small>{selected === card.id ? '已选择 · 点击角色分配' : '选择此牌'}</small>
    </button>)}</div>
    <div className="tuxi-options">{targets.map(unit => <button key={unit.id} disabled={!selected} onClick={() => { if (selected) { choose(selected, unit.id); setSelected(null) } }}>
      <strong>{unit.name}</strong><span>体力 {unit.hp}/{unit.maxHp} · 手牌 {unit.hand.length}</span><small>{selected ? '交给此角色' : '先选择一张牌'}</small>
    </button>)}</div>
  </section></div>
}

function LuoyiWindow() {
  const pending = useGameStore(s => s.pendingLuoyi)
  const choose = useGameStore(s => s.chooseLuoyi)
  if (!pending) return null
  return <div className="overlay response-overlay"><section className="response-panel panel">
    <span className="eyebrow">摸牌阶段 · 裸衣</span>
    <h1>是否发动【裸衣】？</h1>
    <p>发动后本次摸一张牌，本回合使用【杀】或【决斗】造成的伤害 +1；不发动则正常摸两张牌。</p>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => choose(false)}>不发动 · 摸两张</button><button className="primary" onClick={() => choose(true)}>发动裸衣 · 摸一张</button></div>
  </section></div>
}

function GreenDragonWindow() {
  const pending = useGameStore(s => s.pendingGreenDragon)
  const state = useGameStore()
  const player = useGameStore(s => s.units.player)
  const target = useGameStore(s => pending ? s.units[pending.target] : null)
  const choose = useGameStore(s => s.chooseGreenDragon)
  if (!pending || !target) return null
  const slashes = greenDragonChoices(state, 'player', pending.target)
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">武器技能 · 青龙偃月刀</span>
    <h1>继续追击{target.name}？</h1>
    <p>刚才的【杀】已被闪避。可以再打出一张【杀】攻击同一目标，也可以放弃追击。</p>
    <div className="response-cards">{slashes.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => choose(card.id)}>
      <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong><small>{isSlashKind(card.kind) ? CARD_COPY[card.kind] : player.skills.includes('longdan') && card.kind === 'dodge' ? '龙胆 · 当【杀】使用' : `${player.hand.some(held => held.id === card.id) ? '手牌' : '装备'} · 武圣 → 杀`}</small>
    </button>)}</div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => choose(null)}>不追击 · 保留手牌</button></div>
  </section></div>
}

function LiuliWindow() {
  const pending = useGameStore(s => s.pendingLiuli)
  const units = useGameStore(s => s.units)
  const state = useGameStore()
  const choose = useGameStore(s => s.chooseLiuli)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<Team | null>(null)
  if (!pending) return null
  const player = units.player
  const cards = [...player.hand, ...Object.values(player.equipment).filter((card): card is Card => !!card)]
  const playerAfterDiscard = paymentId ? { ...player, equipment: Object.fromEntries(Object.entries(player.equipment).filter(([, card]) => card?.id !== paymentId)) as Unit['equipment'] } : player
  const targets = state.turnOrder.map(id => units[id]).filter(unit => unit.id !== 'player' && unit.id !== pending.source && unit.hp > 0 && combatDistance(state, playerAfterDiscard, unit) <= effectiveAttackRange(state, playerAfterDiscard))
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">受到【杀】时 · 流离</span>
    <h1>弃一张牌，转移攻击？</h1>
    <p>选择一张手牌或装备，再选择你攻击范围内的另一名武将。也可以不发动，继续正常防御。</p>
    <div className="response-cards">{cards.map(card => <button key={card.id} className={`card ${card.kind} ${paymentId === card.id ? 'selected' : ''}`} onClick={() => { setPaymentId(card.id); setTargetId(null) }}>
      <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong><small>{player.hand.some(item => item.id === card.id) ? '手牌 · 弃置' : '装备 · 弃置'}</small>
    </button>)}</div>
    <div className="tuxi-options">{targets.map(unit => <button key={unit.id} className={targetId === unit.id ? 'active' : ''} onClick={() => setTargetId(unit.id)}><strong>{unit.name}</strong><span>距离 {combatDistance(state, player, unit)}</span><small>{targetId === unit.id ? '已选择' : '转移目标'}</small></button>)}</div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => choose(null)}>不发动 · 正常防御</button><button className="primary" disabled={!paymentId || !targetId} onClick={() => choose(paymentId, targetId ?? undefined)}>发动流离</button></div>
  </section></div>
}

function AxeWindow() {
  const pending = useGameStore(s => s.pendingAxe)
  const player = useGameStore(s => s.units.player)
  const target = useGameStore(s => pending ? s.units[pending.target] : null)
  const choose = useGameStore(s => s.chooseAxe)
  const [selected, setSelected] = useState<string[]>([])
  if (!pending || !target) return null
  const cards = [...player.hand, ...Object.values(player.equipment).filter((card): card is Card => !!card)]
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 2 ? [...current, id] : current)
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">武器技能 · 贯石斧</span>
    <h1>弃两张牌，强制命中{target.name}？</h1>
    <p>目标已经避开这张【杀】。选择两张手牌或装备弃置后仍可造成 {pending.amount} 点伤害，也可以保留牌放弃追击。</p>
    <div className="response-cards">{cards.map(card => <button key={card.id} className={`card ${card.kind} ${selected.includes(card.id) ? 'selected' : ''}`} onClick={() => toggle(card.id)}>
      <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
      <strong>{CARD_LABEL[card.kind]}</strong><small>{player.hand.some(item => item.id === card.id) ? '手牌' : '装备'} · {selected.includes(card.id) ? '已选择' : '点击弃置'}</small>
    </button>)}</div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => choose(null)}>不发动 · 保留牌</button><button className="primary" disabled={selected.length !== 2} onClick={() => choose(selected)}>发动贯石斧 {selected.length}/2</button></div>
  </section></div>
}

function IceSwordWindow() {
  const pending = useGameStore(s => s.pendingIceSword)
  const target = useGameStore(s => pending ? s.units[pending.target] : null)
  const choose = useGameStore(s => s.chooseIceSword)
  const [selected, setSelected] = useState<string[]>([])
  if (!pending || !target) return null
  const equipment = Object.values(target.equipment).filter((card): card is Card => !!card)
  const count = Math.min(2, target.hand.length + equipment.length)
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < count ? [...current, id] : current)
  return <div className="overlay response-overlay"><section className="response-panel choice-panel panel">
    <span className="eyebrow">造成伤害前 · 寒冰剑</span>
    <h1>改为弃置{target.name}的牌？</h1>
    <p>发动后本次【杀】不造成伤害，改为弃置 {count} 张牌。手牌保持暗置，装备牌可辨认；也可以直接造成 {pending.amount} 点伤害。</p>
    <div className="response-cards">
      {target.hand.map((card, index) => <button key={card.id} className={`hidden-card ${selected.includes(card.id) ? 'selected' : ''}`} onClick={() => toggle(card.id)}><strong>暗</strong><span>手牌 {index + 1}{selected.includes(card.id) ? ' · 已选' : ''}</span></button>)}
      {equipment.map(card => <button key={card.id} className={`card ${card.kind} ${selected.includes(card.id) ? 'selected' : ''}`} onClick={() => toggle(card.id)}><span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span><strong>{CARD_LABEL[card.kind]}</strong><small>装备 · {selected.includes(card.id) ? '已选' : '弃置'}</small></button>)}
    </div>
    <div className="guanxing-actions"><button className="decline-response" onClick={() => choose(null)}>不发动 · 造成伤害</button><button className="primary" disabled={selected.length !== count} onClick={() => choose(selected)}>发动寒冰剑 {selected.length}/{count}</button></div>
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
    <p>手牌以牌背显示；装备区与判定区为公开信息，可直接选择。</p>
    <div className="plunder-cards">
      {target.hand.map((card, index) => <button key={card.id} className="hidden-card" onClick={() => choosePlunderCard(card.id)}><strong>战</strong><span>手牌 {index + 1}</span></button>)}
      {equipment.map(([slot, card]) => <button key={card.id} className={`card ${card.kind}`} onClick={() => choosePlunderCard(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>{slotLabel[slot]}</small>
      </button>)}
      {!pending.reason && target.judgement.map(card => <button key={card.id} className={`card ${card.kind}`} onClick={() => choosePlunderCard(card.id)}>
        <span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{SUIT_GLYPH[card.suit]} {card.rank}</span>
        <strong>{CARD_LABEL[card.kind]}</strong><small>判定区</small>
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
  const [sound, setSound] = useState(() => localStorage.getItem('wargrid-sound') !== 'off')
  const [showHistory, setShowHistory] = useState(false)
  const [inspectedUnit, setInspectedUnit] = useState<{ team: Team; portrait: string; skillText: string } | null>(null)
  const [tutorial, setTutorial] = useState(() => localStorage.getItem('wargrid-tutorial') !== 'seen')
  const selectedCard = state.units.player.hand.find(c => c.id === state.selectedCardId) ?? (state.selectedAsGuose || state.selectedAsSlash && state.units.player.skills.includes('wusheng') ? Object.values(state.units.player.equipment).find(card => card?.id === state.selectedCardId) : undefined)
  const canWusheng = state.units.player.skills.includes('wusheng') && state.units.player.attacksUsed < slashLimit(state.units.player) && [...state.units.player.hand, ...Object.values(state.units.player.equipment).filter((card): card is Card => !!card)].some(card => !isSlashKind(card.kind) && (card.suit === 'heart' || card.suit === 'diamond'))
  const canSpear = state.units.player.equipment.weapon?.kind === 'spear' && state.units.player.hand.length >= 2 && state.units.player.attacksUsed < 1
  const canJijiang = state.units.player.identity === 'lord' && state.units.player.skills.includes('jijiang') && state.units.player.attacksUsed < slashLimit(state.units.player) && Object.values(state.units).some(unit => unit.identity === 'loyalist' && unit.faction === 'shu' && unit.hp > 0 && (unit.hand.some(card => isSlashKind(card.kind)) || (unit.skill === 'longdan' && unit.hand.some(card => card.kind === 'dodge')) || (unit.skills.includes('wusheng') && [...unit.hand, ...Object.values(unit.equipment).filter((card): card is Card => !!card)].some(card => card.suit === 'heart' || card.suit === 'diamond'))))
  const canQixi = state.units.player.skill === 'qixi' && selectedCard && (selectedCard.suit === 'spade' || selectedCard.suit === 'club')
  const canZhiheng = state.units.player.skill === 'zhiheng' && !state.units.player.skillUsed
  const canQingnang = state.units.player.skills.includes('qingnang') && !state.units.player.skillUsed && !!selectedCard && Object.values(state.units).some(unit => unit.hp > 0 && unit.hp < unit.maxHp)
  const canFanjian = state.units.player.skills.includes('fanjian') && !state.units.player.skillUsed && !!selectedCard
  const canJieyin = state.units.player.skills.includes('jieyin') && !state.units.player.skillUsed && state.units.player.hand.length >= 2 && Object.values(state.units).some(unit => unit.id !== 'player' && unit.hp > 0 && unit.hp < unit.maxHp && unit.gender === 'male')
  const canRende = state.units.player.skills.includes('rende') && !!selectedCard
  const canKurou = state.units.player.skills.includes('kurou') && state.units.player.hp > 0
  const canGuose = state.units.player.skills.includes('guose') && [...state.units.player.hand, ...Object.values(state.units.player.equipment).filter((card): card is Card => !!card)].some(card => card.suit === 'diamond')
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

  useEffect(() => {
    if (!sound) setAudioEnabled(false)
    document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true })
    document.addEventListener('keydown', unlockAudio, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', unlockAudio, true)
      document.removeEventListener('keydown', unlockAudio, true)
    }
  }, [])

  useEffect(() => useGameStore.subscribe((next, previous) => playAudioEvents(audioEvents(previous, next))), [])

  useEffect(() => {
    setMusicScene(!state.generalSelected ? 'menu' : state.winner ? 'result' : state.units.player.hp <= 2 ? 'danger' : 'battle')
  }, [state.generalSelected, state.winner, state.units.player.hp])

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">W</span><div><strong>WARGRID</strong><small>{MAP_DEFINITIONS[state.mapId].name} · {state.deckMode === 'standard' ? '标准' : '扩展'} · 第 {state.turn} 回合</small></div></div>
      <div className={`turn-indicator ${state.phase}`}><span />{state.phase === 'player' ? '你的回合' : state.phase === 'ai' ? `${currentName}行动` : '战局结束'}</div>
      <div className="header-actions">
        <button className="icon-button" onClick={() => setShowHistory(true)} aria-label="查看战报"><ScrollText /></button>
        <button className="icon-button" onClick={() => setTutorial(true)} aria-label="查看规则"><CircleHelp /></button>
        <button className="icon-button" onClick={() => setSound(value => { const next = !value; localStorage.setItem('wargrid-sound', next ? 'on' : 'off'); setAudioEnabled(next); return next })} aria-label={sound ? '关闭音效' : '开启音效'} aria-pressed={sound}>{sound ? <Volume2 /> : <VolumeX />}</button>
        <button className="icon-button" onClick={() => dispatch({ type: 'RESTART' })} aria-label="重新开始"><RotateCcw /></button>
      </div>
    </header>

    <aside className="status-left"><PlayerStatus team="player" onInspect={(team, portrait, skillText) => setInspectedUnit({ team, portrait, skillText })} /></aside>
    <aside className="ai-roster"><PlayerStatus team="north" onInspect={(team, portrait, skillText) => setInspectedUnit({ team, portrait, skillText })} /><PlayerStatus team="east" onInspect={(team, portrait, skillText) => setInspectedUnit({ team, portrait, skillText })} /><PlayerStatus team="west" onInspect={(team, portrait, skillText) => setInspectedUnit({ team, portrait, skillText })} /></aside>
    {inspectedUnit && <UnitDetails {...inspectedUnit} close={() => setInspectedUnit(null)} />}
    <div className="battlefield">{state.generalSelected && <Battlefield />}</div>

    <div className="message-bar"><span className="message-pip" />{state.message}</div>

    <footer className="command-deck">
      <div className="movement"><span>{state.turnStage === 'play' ? `出牌阶段 · 移动 ${state.units.player.movement}` : state.turnStage === 'discard' ? `弃牌 ${state.discardSelection.length}/${discardRequired}` : state.turnStage}</span><div>{Array.from({ length: Math.max(3, state.units.player.movement) }, (_, index) => index + 1).map(n => <i key={n} className={state.turnStage === 'play' && n <= state.units.player.movement ? 'active' : ''} />)}</div></div>
      <div className="hand" aria-label="你的手牌">
        {state.units.player.hand.map(card => <CardView key={card.id} card={card} selected={state.turnStage === 'discard' ? state.discardSelection.includes(card.id) : state.jieyinMode ? state.jieyinSelection.includes(card.id) : state.zhihengMode ? state.zhihengSelection.includes(card.id) : state.spearMode ? state.spearSelection.includes(card.id) : selectedCard?.id === card.id} />)}
        {state.zhihengMode && Object.values(state.units.player.equipment).filter((card): card is Card => !!card).map(card => <CardView key={card.id} card={card} equipped selected={state.zhihengSelection.includes(card.id)} />)}
        {state.selectedAsGuose && Object.values(state.units.player.equipment).filter((card): card is Card => !!card && card.suit === 'diamond').map(card => <CardView key={card.id} card={card} equipped selected={state.selectedCardId === card.id} />)}
        {state.selectedAsSlash && state.units.player.skills.includes('wusheng') && Object.values(state.units.player.equipment).filter((card): card is Card => !!card && (card.suit === 'heart' || card.suit === 'diamond')).map(card => <CardView key={card.id} card={card} equipped selected={state.selectedCardId === card.id} />)}
        {!state.units.player.hand.length && <span className="empty-hand">暂无手牌</span>}
      </div>
      <div className="turn-actions">
        {state.turnStage === 'play' && canWusheng && <button className={`secondary skill-action ${state.selectedAsSlash ? 'active' : ''}`} onClick={() => state.activateWusheng()}><Swords />武圣</button>}
        {state.turnStage === 'play' && canSpear && <button className={`secondary skill-action ${state.spearMode ? 'active' : ''}`} onClick={() => state.activateSpear()}><Swords />丈八</button>}
        {state.turnStage === 'play' && canJijiang && <button className={`secondary skill-action ${state.jijiangSource ? 'active' : ''}`} onClick={() => state.activateJijiang()}><Swords />激将</button>}
        {state.turnStage === 'play' && canQixi && <button className={`secondary skill-action ${state.selectedAsDismantle ? 'active' : ''}`} onClick={() => state.activateQixi()}><Swords />奇袭</button>}
        {state.turnStage === 'play' && canZhiheng && <button className={`secondary skill-action ${state.zhihengMode ? 'active' : ''}`} onClick={() => state.activateZhiheng()}><Swords />{state.zhihengMode && state.zhihengSelection.length ? `制衡${state.zhihengSelection.length}` : '制衡'}</button>}
        {state.turnStage === 'play' && canQingnang && <button className={`secondary skill-action ${state.qingnangMode ? 'active' : ''}`} onClick={() => state.activateQingnang()}><Swords />青囊</button>}
        {state.turnStage === 'play' && canFanjian && <button className={`secondary skill-action ${state.selectedAsFanjian ? 'active' : ''}`} onClick={() => state.activateFanjian()}><Swords />反间</button>}
        {state.turnStage === 'play' && canJieyin && <button className={`secondary skill-action ${state.jieyinMode ? 'active' : ''}`} onClick={() => state.activateJieyin()}><Swords />{state.jieyinMode ? `结姻 ${state.jieyinSelection.length}/2` : '结姻'}</button>}
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
    {state.generalSelected && !tutorial && state.pendingJudgement && <JudgementWindow />}
    {state.generalSelected && !tutorial && state.pendingLuoshen && <LuoshenWindow />}
    {state.generalSelected && !tutorial && state.pendingGuanxing && <GuanxingWindow />}
    {state.generalSelected && !tutorial && state.pendingTuxi && <TuxiWindow />}
    {state.generalSelected && !tutorial && state.pendingHalberd && <HalberdWindow />}
    {state.generalSelected && !tutorial && state.pendingQilin && <QilinWindow />}
    {state.generalSelected && !tutorial && state.pendingYiji && <YijiWindow />}
    {state.generalSelected && !tutorial && state.pendingLuoyi && <LuoyiWindow />}
    {state.generalSelected && !tutorial && state.pendingGreenDragon && <GreenDragonWindow />}
    {state.generalSelected && !tutorial && state.pendingLiuli && <LiuliWindow />}
    {state.generalSelected && !tutorial && state.pendingAxe && <AxeWindow />}
    {state.generalSelected && !tutorial && state.pendingIceSword && <IceSwordWindow />}
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
