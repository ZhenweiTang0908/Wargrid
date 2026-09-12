import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGameStore } from './game/store'
import { MAP_DEFINITIONS } from './game/rules'
import type { MapId, Position, TerrainKind } from './types'

const gap = 1.06

function surfaceTexture(mapId: MapId, size: number, terrain: { position: Position; kind: TerrainKind }[]) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  const map = MAP_DEFINITIONS[mapId]
  const cell = canvas.width / size
  ctx.fillStyle = map.groundColors[0]
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const seed = [...mapId].reduce((value, letter) => value * 31 + letter.charCodeAt(0), 17)
  const random = (i: number) => {
    const value = Math.sin(i * 127.1 + seed * 73.7) * 43758.5453
    return value - Math.floor(value)
  }
  const center = (position: Position) => ({ x: (position.x + .5) * cell, y: (size - position.y - .5) * cell })
  // Diffuse pigment and fine speckle read as soil, sand or snow from above.
  for (let i = 0; i < 15500; i++) {
    const x = random(i * 3 + 1) * 1024
    const y = random(i * 3 + 2) * 1024
    const radius = 1 + random(i * 3 + 3) * 7
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = random(i + 73) > .5 ? 'rgba(255,236,192,.045)' : 'rgba(0,15,12,.075)'
    ctx.fill()
  }
  const terrainMap = new Map(terrain.map(t => [`${t.position.x},${t.position.y}`, t.kind]))
  const kindAt = (x: number, y: number) => terrainMap.get(`${x},${y}`) ?? 'plain'
  const palette: Partial<Record<TerrainKind, string>> = {
    water: mapId === 'winter' ? '#648d99' : '#23596b', bridge: '#8f724c',
    road: mapId === 'desert' ? '#c7a373' : '#8b7858', forest: mapId === 'maple' ? '#684934' : '#355944',
    marsh: '#626e4d', snow: '#dce9e7', ridge: '#777a68', camp: '#80624c', village: '#a18a6a', watchtower: '#8e775a',
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const kind = kindAt(x, y) as TerrainKind
    if (kind === 'plain' || kind === 'road' || kind === 'water' || kind === 'bridge') continue
    const point = center({ x, y })
    const gradient = ctx.createRadialGradient(point.x, point.y, cell * .12, point.x, point.y, cell * .85)
    gradient.addColorStop(0, palette[kind] ?? map.groundColors[1])
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(point.x - cell, point.y - cell, cell * 2, cell * 2)
  }
  // Connected strokes make roads and rivers continuous instead of tile decals.
  for (const kind of ['water', 'road', 'bridge'] as const) {
    const points = terrain.filter(t => t.kind === kind)
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.strokeStyle = palette[kind]!
    ctx.lineWidth = kind === 'water' ? cell * .82 : kind === 'road' ? cell * .38 : cell * .56
    for (const { position } of points) {
      const a = center(position)
      ctx.beginPath()
      ctx.arc(a.x, a.y, ctx.lineWidth * .45, 0, Math.PI * 2)
      ctx.fillStyle = palette[kind]!
      ctx.fill()
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (kindAt(position.x + dx, position.y + dy) !== kind) continue
        const b = center({ x: position.x + dx, y: position.y + dy })
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
    }
  }
  // Worn tracks and scattered stones are quiet; interaction highlights stay dominant.
  for (let i = 0; i < 500; i++) {
    const x = random(i * 5 + 101) * 1024, y = random(i * 5 + 102) * 1024
    ctx.strokeStyle = random(i + 301) > .5 ? 'rgba(232,215,173,.14)' : 'rgba(17,24,20,.16)'
    ctx.lineWidth = 1 + random(i + 401) * 2
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 + random(i + 501) * 10, y + random(i + 601) * 6); ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function BattlefieldGround() {
  const mapId = useGameStore(state => state.mapId)
  const terrain = useGameStore(state => state.terrain)
  const size = useGameStore(state => state.size)
  const texture = useMemo(() => surfaceTexture(mapId, size, terrain), [mapId, size, terrain])
  useEffect(() => () => texture.dispose(), [texture])
  return <group>
    <mesh rotation-x={-Math.PI / 2} position-y={-.023} receiveShadow>
      <planeGeometry args={[size * gap, size * gap]} />
      <meshStandardMaterial map={texture} roughness={.96} />
    </mesh>
    <mesh position-y={-.32} receiveShadow>
      <cylinderGeometry args={[size * gap * .72, size * gap * .78, .58, 32]} />
      <meshStandardMaterial color={MAP_DEFINITIONS[mapId].groundColors[0]} roughness={1} flatShading />
    </mesh>
  </group>
}
