import * as THREE from 'three'
import type { Unit } from './types'

type Props = { unit: Unit; color: string; darkColor: string; accent: string }

const armoredSkills = new Set(['wusheng', 'longdan', 'ganglie', 'jianxiong', 'tuxi', 'luoyi', 'paoxiao', 'wushuang', 'tieqi', 'mashu', 'yingzi', 'zhiheng', 'qixi', 'kurou'])
const beardSkills = new Set(['wusheng', 'jianxiong', 'paoxiao', 'ganglie', 'rende', 'wushuang', 'luoyi'])

export function CharacterBody({ unit, color, darkColor, accent }: Props) {
  const armored = armoredSkills.has(unit.skill)
  const female = unit.gender === 'female'
  const hair = female ? '#251a20' : unit.skill === 'guanxing' ? '#5f6262' : '#211b1b'
  const skin = female ? '#e4bea4' : '#d6a67f'
  const gold = '#c9a766'
  const cloth = female ? '#e0c9b7' : '#c2b59b'
  return <group>
    {/* Layered robe panels retain a readable silhouette at board camera distance. */}
    {[-1, 0, 1].map(i => <group key={`hem-${i}`} rotation-y={i * .55}>
      <mesh position={[i * .13, .35, -.04]} rotation-z={-i * .12} castShadow>
        <cylinderGeometry args={[.205, .28, .55, 10, 1, false, Math.PI * .07, Math.PI * .86]} />
        <meshStandardMaterial color={i === 0 ? color : darkColor} side={THREE.DoubleSide} roughness={.81} />
      </mesh>
      <mesh position={[i * .25, .24, .15]} rotation-z={-i * .12}>
        <boxGeometry args={[.018, .38, .012]} />
        <meshStandardMaterial color={gold} metalness={.48} roughness={.5} />
      </mesh>
    </group>)}
    {[-1, 1].map(side => <group key={`leg-${side}`} position-x={side * .16}>
      <mesh position-y={.28} castShadow><capsuleGeometry args={[.105, .26, 7, 12]} /><meshStandardMaterial color={darkColor} roughness={.78} /></mesh>
      <mesh position={[0, .11, .07]} castShadow><boxGeometry args={[.21, .22, .31]} /><meshStandardMaterial color="#292323" roughness={.76} /></mesh>
      <mesh position={[0, .19, .22]}><boxGeometry args={[.17, .025, .025]} /><meshStandardMaterial color={gold} metalness={.7} /></mesh>
    </group>)}
    {/* Waist, tapered chest, raised collar and crossed lapels. */}
    <mesh position-y={.75} castShadow><cylinderGeometry args={[female ? .26 : .31, .255, .66, 16]} /><meshStandardMaterial color={color} roughness={.72} metalness={armored ? .18 : 0} /></mesh>
    <mesh position={[0, 1.075, .01]} castShadow><cylinderGeometry args={[.2, .27, .19, 14]} /><meshStandardMaterial color={darkColor} roughness={.68} /></mesh>
    {[-1, 1].map(side => <group key={`lapel-${side}`}>
      <mesh position={[side * .115, .98, .265]} rotation-z={side * .48}><boxGeometry args={[.075, .35, .034]} /><meshStandardMaterial color={cloth} roughness={.79} /></mesh>
      <mesh position={[side * .19, .99, .283]} rotation-z={side * .49}><boxGeometry args={[.018, .35, .025]} /><meshStandardMaterial color={gold} metalness={.55} roughness={.4} /></mesh>
    </group>)}
    <mesh position={[0, .63, .01]}><cylinderGeometry args={[.265, .268, .13, 16]} /><meshStandardMaterial color={darkColor} roughness={.53} /></mesh>
    <mesh position={[0, .64, .269]}><boxGeometry args={[.14, .13, .045]} /><meshStandardMaterial color={gold} metalness={.74} roughness={.31} /></mesh>
    <mesh position={[0, .64, .3]}><octahedronGeometry args={[.048]} /><meshStandardMaterial color={accent} metalness={.48} roughness={.3} /></mesh>
    {armored && <>
      <mesh position={[0, .86, .286]} castShadow><boxGeometry args={[.45, .43, .085]} /><meshStandardMaterial color={darkColor} metalness={.53} roughness={.42} /></mesh>
      {[0, 1, 2].flatMap(row => [-1, 0, 1].map(col => <mesh key={`scale-${row}-${col}`} position={[col * .127, 1.008 - row * .115, .345 + row * .005]} rotation-z={col * .08} castShadow>
        <boxGeometry args={[.113, .095, .023]} /><meshStandardMaterial color={row % 2 ? accent : gold} metalness={.73} roughness={.32} />
      </mesh>))}
      <mesh position={[0, 1.075, .375]}><octahedronGeometry args={[.095]} /><meshStandardMaterial color={accent} metalness={.65} roughness={.29} /></mesh>
    </>}
    {/* The cape is split into folded cloth strips instead of a single cone. */}
    {[-1, 0, 1].map(i => <mesh key={`cape-${i}`} position={[i * .205, .71, -.32]} rotation={[.23, 0, i * .12]} castShadow>
      <boxGeometry args={[.23, .82, .055]} /><meshStandardMaterial color={i === 0 ? color : darkColor} roughness={.9} side={THREE.DoubleSide} />
    </mesh>)}
    {[-1, 1].map(side => <group key={`arm-${side}`} position={[side * .36, 1.04, 0]} rotation-z={-side * .13}>
      <mesh position-y={-.14} castShadow><capsuleGeometry args={[.105, .19, 8, 12]} /><meshStandardMaterial color={darkColor} roughness={.71} /></mesh>
      <mesh position-y={-.34} castShadow><cylinderGeometry args={[.115, .084, .22, 12]} /><meshStandardMaterial color={color} roughness={.67} /></mesh>
      <mesh position-y={-.46}><cylinderGeometry args={[.112, .105, .045, 12]} /><meshStandardMaterial color={gold} metalness={.66} roughness={.4} /></mesh>
      <mesh position-y={-.54} castShadow><sphereGeometry args={[.083, 12, 10]} /><meshStandardMaterial color={skin} roughness={.82} /></mesh>
      {armored && <>
        <mesh position={[side * .035, .035, 0]} rotation-z={side * .18} castShadow><sphereGeometry args={[.19, 14, 10]} /><meshStandardMaterial color={accent} metalness={.58} roughness={.39} /></mesh>
        <mesh position={[side * .04, .06, .16]}><sphereGeometry args={[.065, 10, 8]} /><meshStandardMaterial color={gold} metalness={.8} roughness={.3} /></mesh>
      </>}
    </group>)}
    {/* Face has ears, brow ridge, nose, cheek planes and an actual hairline. */}
    <mesh position-y={1.21} castShadow><sphereGeometry args={[female ? .265 : .275, 24, 18]} /><meshStandardMaterial color={skin} roughness={.86} /></mesh>
    {[-1, 1].map(side => <group key={`face-side-${side}`}>
      <mesh position={[side * .267, 1.18, .012]}><sphereGeometry args={[.055, 12, 8]} /><meshStandardMaterial color={skin} roughness={.87} /></mesh>
      <mesh position={[side * .098, 1.253, .251]} scale={[1, .62, .45]}><sphereGeometry args={[.039, 12, 8]} /><meshStandardMaterial color="#292126" roughness={.38} /></mesh>
      <mesh position={[side * .102, 1.319, .24]} rotation-z={side * -.13}><capsuleGeometry args={[.018, .105, 3, 10]} /><meshStandardMaterial color={hair} roughness={.95} /></mesh>
      <mesh position={[side * .145, 1.131, .214]} scale={[1, .75, .5]}><sphereGeometry args={[.075, 12, 8]} /><meshStandardMaterial color={skin} roughness={.9} /></mesh>
    </group>)}
    <mesh position={[0, 1.18, .283]} scale={[.68, 1, .68]}><coneGeometry args={[.065, .13, 8]} /><meshStandardMaterial color={skin} roughness={.9} /></mesh>
    <mesh position={[0, 1.081, .268]}><boxGeometry args={[.085, .012, .014]} /><meshStandardMaterial color="#794b40" roughness={1} /></mesh>
    <mesh position={[0, 1.39, -.045]} scale={[1.05, .51, .98]} castShadow><sphereGeometry args={[.276, 20, 14]} /><meshStandardMaterial color={hair} roughness={.93} /></mesh>
    {[-1, 1].map(side => <mesh key={`hairline-${side}`} position={[side * .148, 1.373, .181]} rotation-z={side * -.23}><capsuleGeometry args={[.059, .12, 5, 9]} /><meshStandardMaterial color={hair} roughness={.92} /></mesh>)}
    {female ? <>
      {[-1, 1].map(side => <group key={`lock-${side}`} position-x={side * .239}>
        <mesh position={[0, 1.06, -.04]} rotation-z={side * .12}><capsuleGeometry args={[.072, .47, 6, 10]} /><meshStandardMaterial color={hair} roughness={.94} /></mesh>
        <mesh position={[0, .83, -.02]}><sphereGeometry args={[.095, 11, 9]} /><meshStandardMaterial color={hair} roughness={.94} /></mesh>
      </group>)}
      <mesh position={[0, 1.56, -.06]}><sphereGeometry args={[.095, 12, 10]} /><meshStandardMaterial color={hair} roughness={.95} /></mesh>
    </> : <>
      <mesh position={[0, 1.55, -.1]}><sphereGeometry args={[.105, 12, 10]} /><meshStandardMaterial color={hair} roughness={.95} /></mesh>
      <mesh position={[0, 1.63, -.1]}><cylinderGeometry args={[.035, .052, .13, 9]} /><meshStandardMaterial color={gold} metalness={.62} roughness={.4} /></mesh>
    </>}
    {beardSkills.has(unit.skill) && <>
      <mesh position={[0, 1.02, .19]} scale={[unit.skill === 'wusheng' ? .65 : .75, unit.skill === 'wusheng' ? 1.5 : .8, .45]}><coneGeometry args={[.18, .34, 12]} /><meshStandardMaterial color={hair} roughness={1} /></mesh>
      {[-1, 1].map(side => <mesh key={`mustache-${side}`} position={[side * .085, 1.07, .276]} rotation-z={side * -.55}><capsuleGeometry args={[.021, .1, 4, 8]} /><meshStandardMaterial color={hair} roughness={1} /></mesh>)}
    </>}
  </group>
}
