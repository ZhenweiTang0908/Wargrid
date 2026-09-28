import * as THREE from 'three'
import type { Unit } from './types'

type Props = { unit: Unit; color: string; darkColor: string; accent: string }

const armoredSkills = new Set(['wusheng', 'longdan', 'ganglie', 'jianxiong', 'tuxi', 'luoyi', 'paoxiao', 'wushuang', 'tieqi', 'mashu', 'yingzi', 'zhiheng', 'qixi', 'kurou'])
const beardSkills = new Set(['wusheng', 'jianxiong', 'paoxiao', 'ganglie', 'rende', 'wushuang', 'luoyi'])

function Polearm({ kind, accent }: { kind: 'guandao' | 'spear' | 'serpent' | 'halberd'; accent: string }) {
  const metal = kind === 'guandao' ? '#aeb8ae' : '#d2d7cf'
  return <group position={[-.44, .82, -.18]} rotation={[.08, 0, .12]}>
    <mesh castShadow><cylinderGeometry args={[kind === 'serpent' || kind === 'halberd' ? .033 : .025, .04, 1.7, 10]} /><meshStandardMaterial color={kind === 'guandao' ? '#5b3828' : '#6b452d'} roughness={.68} /></mesh>
    <mesh position={[0, -.73, 0]}><cylinderGeometry args={[.044, .044, .08, 10]} /><meshStandardMaterial color="#b89a5f" metalness={.65} roughness={.33} /></mesh>
    {kind === 'guandao' ? <group position={[.03, .91, 0]} rotation-z={-.18}>
      <mesh position={[.075, .02, 0]} rotation-z={-.16} castShadow><boxGeometry args={[.16, .38, .045]} /><meshStandardMaterial color={metal} metalness={.72} roughness={.24} /></mesh>
      <mesh position={[.145, .08, 0]} rotation-z={-.45} castShadow><coneGeometry args={[.12, .3, 5]} /><meshStandardMaterial color={metal} metalness={.76} roughness={.22} /></mesh>
      <mesh position={[-.02, -.18, 0]}><torusGeometry args={[.105, .018, 7, 18, Math.PI * 1.35]} /><meshStandardMaterial color="#c6a35f" metalness={.75} roughness={.3} /></mesh>
    </group> : <group position={[0, .94, 0]}>
      {kind !== 'serpent' && <mesh position-y={.13} castShadow><coneGeometry args={[kind === 'halberd' ? .085 : .06, kind === 'halberd' ? .42 : .34, 7]} /><meshStandardMaterial color={metal} metalness={.8} roughness={.19} /></mesh>}
      <mesh position-y={-.06}><cylinderGeometry args={[.052, .035, .12, 9]} /><meshStandardMaterial color="#c6a35f" metalness={.74} roughness={.3} /></mesh>
      {(kind === 'spear' || kind === 'serpent') && <>
        {[-1, 1].map(side => <mesh key={side} position={[side * .045, -.16, 0]} rotation-z={side * .48}><capsuleGeometry args={[.018, .18, 4, 8]} /><meshStandardMaterial color={kind === 'serpent' ? '#8d2525' : accent} roughness={.8} /></mesh>)}
        {kind === 'serpent' && <group position-y={.02}>
          {[
            [-.035, .04, -.22], [.035, .17, .24], [-.03, .3, -.2], [.025, .43, .16], [0, .56, 0],
          ].map(([x, y, rotation], index) => <mesh key={`serpent-${index}`} position={[x, y, 0]} rotation-z={rotation} castShadow>
            <capsuleGeometry args={[.052 - index * .004, .13, 6, 10]} />
            <meshStandardMaterial color={metal} metalness={.86} roughness={.17} />
          </mesh>)}
          <mesh position={[0, .69, 0]} castShadow><coneGeometry args={[.065, .25, 7]} /><meshStandardMaterial color="#e1e5df" metalness={.9} roughness={.14} /></mesh>
          {[-1, 1].map(side => <mesh key={`serpent-hook-${side}`} position={[side * .072, .35, 0]} rotation-z={side * -.74} castShadow><coneGeometry args={[.05, .18, 5]} /><meshStandardMaterial color={metal} metalness={.84} roughness={.17} /></mesh>)}
        </group>}
      </>}
      {kind === 'halberd' && <>
        {[-1, 1].map(side => <group key={side} position={[side * .14, .12, 0]} rotation-z={side * -.58}>
          <mesh scale={[1.25, 1, .45]} castShadow><torusGeometry args={[.16, .047, 7, 18, Math.PI * 1.12]} /><meshStandardMaterial color={metal} metalness={.88} roughness={.16} /></mesh>
          <mesh position={[side * .09, .11, 0]} rotation-z={side * -.52} castShadow><coneGeometry args={[.075, .3, 6]} /><meshStandardMaterial color="#e1e4df" metalness={.9} roughness={.14} /></mesh>
        </group>)}
        <mesh position={[0, -.02, .045]}><octahedronGeometry args={[.065]} /><meshStandardMaterial color="#a62e28" emissive="#4f0d0b" emissiveIntensity={.45} metalness={.55} roughness={.25} /></mesh>
      </>}
    </group>}
  </group>
}

function ZhangFeiRegalia({ accent }: { accent: string }) {
  const bronze = '#c69c50'
  return <group>
    <mesh position={[0, 1.5, -.02]} castShadow><cylinderGeometry args={[.28, .245, .19, 10]} /><meshStandardMaterial color="#231918" metalness={.56} roughness={.37} /></mesh>
    <mesh position={[0, 1.56, .18]} rotation-x={Math.PI / 2}><torusGeometry args={[.22, .032, 7, 18, Math.PI]} /><meshStandardMaterial color={bronze} metalness={.82} roughness={.28} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .22, 1.63, -.02]} rotation-z={side * -.62} castShadow><coneGeometry args={[.07, .35, 6]} /><meshStandardMaterial color={accent} metalness={.35} roughness={.46} /></mesh>
      {[0, 1, 2].map(layer => <mesh key={layer} position={[side * (.39 + layer * .03), 1.04 - layer * .08, -.015]} rotation-z={side * (.18 + layer * .06)} scale={[1 - layer * .12, 1, 1]} castShadow>
        <boxGeometry args={[.29, .18, .32]} /><meshStandardMaterial color={layer === 1 ? '#4a211d' : accent} metalness={.66} roughness={.38} />
      </mesh>)}
      <mesh position={[side * .42, .49, -.29]} rotation-z={side * .19} castShadow><boxGeometry args={[.25, .72, .055]} /><meshStandardMaterial color="#541d1a" roughness={.88} side={THREE.DoubleSide} /></mesh>
    </group>)}
    <mesh position={[0, .83, .37]}><cylinderGeometry args={[.13, .13, .035, 12]} /><meshStandardMaterial color={bronze} metalness={.76} roughness={.31} /></mesh>
    <mesh position={[0, .83, .395]} rotation-z={Math.PI / 4}><boxGeometry args={[.13, .13, .035]} /><meshStandardMaterial color="#56201c" metalness={.42} roughness={.38} /></mesh>
  </group>
}

function LuBuRegalia({ accent }: { accent: string }) {
  const gold = '#d3aa58'
  return <group>
    <mesh position={[0, 1.53, -.02]} castShadow><cylinderGeometry args={[.27, .23, .2, 10]} /><meshStandardMaterial color="#26181b" metalness={.65} roughness={.31} /></mesh>
    <mesh position={[0, 1.64, .01]} castShadow><torusGeometry args={[.23, .033, 7, 18]} /><meshStandardMaterial color={gold} metalness={.86} roughness={.24} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .17, 1.72, -.03]} rotation-z={side * -.48} castShadow><coneGeometry args={[.075, .32, 6]} /><meshStandardMaterial color={gold} metalness={.88} roughness={.21} /></mesh>
      <group position={[side * .16, 1.89, -.05]} rotation-z={side * -.15}>
        {[0, 1, 2].map(segment => <mesh key={segment} position={[side * segment * .035, segment * .2, 0]} rotation-z={side * segment * .09} castShadow>
          <capsuleGeometry args={[.033 - segment * .004, .2, 5, 9]} /><meshStandardMaterial color={segment === 1 ? '#c43b31' : accent} roughness={.74} />
        </mesh>)}
      </group>
      <mesh position={[side * .44, 1.04, 0]} rotation-z={side * .28} castShadow><dodecahedronGeometry args={[.25, 0]} /><meshStandardMaterial color={accent} metalness={.72} roughness={.32} /></mesh>
      <mesh position={[side * .45, 1.07, .19]} rotation-z={side * .28}><coneGeometry args={[.075, .22, 5]} /><meshStandardMaterial color={gold} metalness={.9} roughness={.2} /></mesh>
      <mesh position={[side * .33, .56, -.31]} rotation-z={side * .16} castShadow><boxGeometry args={[.3, .88, .055]} /><meshStandardMaterial color="#6e201f" roughness={.86} side={THREE.DoubleSide} /></mesh>
    </group>)}
    <mesh position={[0, .9, .39]} scale={[1.15, 1, .55]}><octahedronGeometry args={[.15]} /><meshStandardMaterial color={gold} metalness={.87} roughness={.22} /></mesh>
    <mesh position={[0, .9, .47]}><sphereGeometry args={[.055, 10, 8]} /><meshStandardMaterial color="#bd3028" emissive="#5d0e0b" emissiveIntensity={.5} metalness={.55} roughness={.25} /></mesh>
  </group>
}

function FeatherFan({ accent }: { accent: string }) {
  return <group position={[.34, .66, .16]} rotation={[.08, -.22, -.42]}>
    <mesh position-y={-.22} castShadow><capsuleGeometry args={[.027, .36, 5, 9]} /><meshStandardMaterial color="#5e3c29" roughness={.76} /></mesh>
    {[-2, -1, 0, 1, 2].map(index => <group key={index} position={[index * .055, .13 + Math.abs(index) * -.025, 0]} rotation-z={index * -.13}>
      <mesh position-y={.15} scale={[.7, 1.4, .34]} castShadow><capsuleGeometry args={[.052, .22, 5, 9]} /><meshStandardMaterial color={index === 0 ? '#f1ead7' : '#d8d1bf'} roughness={.92} /></mesh>
      <mesh position-y={.02}><cylinderGeometry args={[.009, .012, .31, 7]} /><meshStandardMaterial color={index === 0 ? accent : '#a99b7c'} roughness={.77} /></mesh>
    </group>)}
    <mesh position-y={-.03}><cylinderGeometry args={[.045, .035, .09, 9]} /><meshStandardMaterial color="#c9a766" metalness={.66} roughness={.34} /></mesh>
  </group>
}

function BowAndQuiver({ accent }: { accent: string }) {
  return <group>
    <group position={[.37, .73, .05]} rotation={[0, -.18, -.2]}>
      <mesh rotation-z={Math.PI / 2} castShadow><torusGeometry args={[.3, .024, 7, 24, Math.PI * 1.45]} /><meshStandardMaterial color="#75462d" roughness={.72} /></mesh>
      <mesh position={[-.03, 0, .006]} rotation-z={-.23}><boxGeometry args={[.018, .54, .014]} /><meshStandardMaterial color="#d8c9a0" roughness={.68} /></mesh>
      <mesh position={[.13, -.02, .015]}><cylinderGeometry args={[.034, .034, .1, 8]} /><meshStandardMaterial color={accent} roughness={.58} /></mesh>
    </group>
    <group position={[-.3, .78, -.2]} rotation={[.12, 0, .2]}>
      <mesh castShadow><cylinderGeometry args={[.075, .095, .5, 10]} /><meshStandardMaterial color="#50362b" roughness={.82} /></mesh>
      {[-1, 0, 1].map(index => <group key={index} position={[index * .035, .36 + Math.abs(index) * -.025, 0]} rotation-z={index * .07}>
        <mesh><cylinderGeometry args={[.009, .009, .46, 6]} /><meshStandardMaterial color="#bca679" roughness={.72} /></mesh>
        <mesh position-y={.25}><coneGeometry args={[.038, .13, 5]} /><meshStandardMaterial color={index === 0 ? accent : '#d7d0b7'} roughness={.78} /></mesh>
      </group>)}
    </group>
  </group>
}

function ScrollCase({ accent }: { accent: string }) {
  return <group position={[.33, .58, .05]} rotation-z={-.18}>
    <mesh castShadow><cylinderGeometry args={[.075, .075, .48, 12]} /><meshStandardMaterial color="#b39a6d" roughness={.82} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position-y={side * .255}><cylinderGeometry args={[.095, .095, .055, 12]} /><meshStandardMaterial color="#654431" roughness={.7} /></mesh>)}
    <mesh position={[0, 0, .076]}><boxGeometry args={[.11, .18, .018]} /><meshStandardMaterial color={accent} roughness={.62} /></mesh>
    <mesh position={[0, 0, .09]} rotation-z={Math.PI / 4}><boxGeometry args={[.045, .045, .012]} /><meshStandardMaterial color="#c9a766" metalness={.62} roughness={.34} /></mesh>
  </group>
}

function SignatureGear({ unit, accent }: { unit: Unit; accent: string }) {
  if (!unit.equipment.weapon) {
    if (unit.skill === 'wusheng') return <Polearm kind="guandao" accent={accent} />
    if (unit.skill === 'paoxiao') return <Polearm kind="serpent" accent={accent} />
    if (unit.skill === 'longdan' || unit.skill === 'tieqi') return <Polearm kind="spear" accent={accent} />
    if (unit.skill === 'wushuang') return <Polearm kind="halberd" accent={accent} />
    if (unit.skill === 'jianxiong' || unit.skill === 'rende' || unit.skill === 'zhiheng' || unit.skill === 'yingzi') return <group position={[.34, .55, -.02]} rotation-z={-.48}>
      <mesh castShadow><capsuleGeometry args={[.035, .68, 6, 10]} /><meshStandardMaterial color="#32251f" roughness={.62} /></mesh>
      <mesh position-y={.38}><boxGeometry args={[.23, .045, .065]} /><meshStandardMaterial color="#c6a35f" metalness={.72} roughness={.3} /></mesh>
      <mesh position-y={.44}><cylinderGeometry args={[.035, .045, .12, 9]} /><meshStandardMaterial color={accent} roughness={.54} /></mesh>
    </group>
    if (unit.skill === 'qixi') return <group position={[.34, .66, .05]} rotation-z={-.34}>
      {[-1, 1].map(side => <group key={side} position={[side * .06, 0, side * .025]} rotation-z={side * .18}>
        <mesh castShadow><boxGeometry args={[.045, .55, .035]} /><meshStandardMaterial color="#aeb9b4" metalness={.75} roughness={.22} /></mesh>
        <mesh position-y={-.31}><boxGeometry args={[.18, .045, .055]} /><meshStandardMaterial color="#c6a35f" metalness={.72} roughness={.3} /></mesh>
      </group>)}
    </group>
  }
  if (unit.skill === 'qingnang') return <group position={[.32, .55, .12]} rotation-z={-.16}>
    <mesh position-y={-.06} castShadow><sphereGeometry args={[.12, 13, 10]} /><meshStandardMaterial color="#8d6842" roughness={.82} /></mesh>
    <mesh position-y={.07} castShadow><sphereGeometry args={[.075, 12, 9]} /><meshStandardMaterial color="#b38a55" roughness={.8} /></mesh>
    <mesh position-y={.16}><cylinderGeometry args={[.035, .045, .09, 9]} /><meshStandardMaterial color="#60452e" roughness={.8} /></mesh>
    <mesh position={[0, .11, .075]} rotation-x={Math.PI / 2}><torusGeometry args={[.09, .012, 6, 14]} /><meshStandardMaterial color={accent} roughness={.7} /></mesh>
  </group>
  if (unit.skill === 'guanxing' || unit.skill === 'jizhi') return <FeatherFan accent={accent} />
  if (unit.skill === 'jieyin') return <BowAndQuiver accent={accent} />
  if (unit.skill === 'feedback' || unit.skill === 'yiji' || unit.skill === 'luoshen') return <ScrollCase accent={accent} />
  return null
}

function HeroRegalia({ skill, accent }: { skill: Unit['skill']; accent: string }) {
  const gold = '#c9a766'
  if (skill === 'paoxiao') return <ZhangFeiRegalia accent={accent} />
  if (skill === 'wushuang') return <LuBuRegalia accent={accent} />
  if (skill === 'guanxing' || skill === 'kongcheng' || skill === 'jizhi' || skill === 'qicai') return <group>
    <mesh position={[0, 1.61, -.08]} rotation-z={-.06} castShadow><cylinderGeometry args={[.17, .2, .075, 12]} /><meshStandardMaterial color="#443d33" roughness={.8} /></mesh>
    <mesh position={[0, 1.69, -.07]} castShadow><coneGeometry args={[.19, .17, 12]} /><meshStandardMaterial color={skill === 'guanxing' || skill === 'kongcheng' ? '#e0d4b8' : accent} roughness={.72} /></mesh>
    <mesh position={[0, 1.76, -.07]}><sphereGeometry args={[.035, 8, 6]} /><meshStandardMaterial color={gold} metalness={.72} roughness={.3} /></mesh>
    {(skill === 'guanxing' || skill === 'kongcheng') && <group position={[.29, 1.11, -.12]} rotation={[.12, -.25, -.28]}>
      <mesh><boxGeometry args={[.045, .52, .025]} /><meshStandardMaterial color="#6b4b2f" roughness={.78} /></mesh>
      {[-1, 0, 1].map(index => <mesh key={index} position={[index * .035, .28 + index * .025, .02]} rotation-z={index * .18}><coneGeometry args={[.045, .22, 5]} /><meshStandardMaterial color={index === 0 ? '#e2d1a4' : '#a98b58'} roughness={.76} /></mesh>)}
    </group>}
  </group>
  if (skill === 'jianxiong' || skill === 'hujia') return <group>
    <mesh position={[0, 1.59, -.01]} rotation-x={-.08} castShadow><torusGeometry args={[.2, .026, 7, 18]} /><meshStandardMaterial color={gold} metalness={.78} roughness={.28} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * .15, 1.72, -.02]} rotation-z={side * -.18} castShadow><coneGeometry args={[.07, .28, 6]} /><meshStandardMaterial color={accent} metalness={.25} roughness={.56} /></mesh>)}
    <mesh position={[0, 1.72, -.02]}><sphereGeometry args={[.042, 10, 8]} /><meshStandardMaterial color={gold} metalness={.8} roughness={.25} /></mesh>
  </group>
  if (skill === 'luoshen' || skill === 'qingguo' || skill === 'guose' || skill === 'liuli' || skill === 'jieyin' || skill === 'xiaoji' || skill === 'biyue' || skill === 'lijian') return <group>
    {[-1, 1].map(side => <group key={side} position={[side * .2, 1.52, .08]}>
      <mesh position-y={.05} rotation-z={side * .26}><capsuleGeometry args={[.022, .24, 5, 9]} /><meshStandardMaterial color={gold} metalness={.68} roughness={.34} /></mesh>
      <mesh position={[side * .035, .18, .01]}><sphereGeometry args={[.052, 10, 8]} /><meshStandardMaterial color={skill === 'luoshen' || skill === 'qingguo' ? '#8d83bd' : '#bd5c67'} metalness={.22} roughness={.4} /></mesh>
    </group>)}
    <mesh position={[0, 1.6, -.12]} rotation-z={Math.PI / 2}><torusGeometry args={[.13, .018, 6, 14, Math.PI]} /><meshStandardMaterial color={accent} metalness={.42} roughness={.45} /></mesh>
  </group>
  if (skill === 'qixi' || skill === 'tuxi' || skill === 'kurou') return <group>
    <mesh position={[0, 1.49, -.01]} rotation-z={-.05} castShadow><torusGeometry args={[.27, .035, 7, 18, Math.PI * 1.35]} /><meshStandardMaterial color={skill === 'qixi' ? '#1b5d65' : '#4b3030'} roughness={.78} /></mesh>
    <mesh position={[.26, 1.38, .13]} rotation-z={-.35}><boxGeometry args={[.07, .42, .045]} /><meshStandardMaterial color={skill === 'qixi' ? '#2b8b92' : '#6b4c3c'} roughness={.74} /></mesh>
  </group>
  if (skill === 'tieqi' || skill === 'mashu' || skill === 'luoyi') return <group>
    <mesh position={[0, 1.66, -.04]} rotation-z={-.1} castShadow><coneGeometry args={[.055, .42, 6]} /><meshStandardMaterial color={accent} metalness={.32} roughness={.5} /></mesh>
    <mesh position={[0, 1.49, .12]} rotation-z={Math.PI / 2}><torusGeometry args={[.25, .026, 7, 18, Math.PI]} /><meshStandardMaterial color={gold} metalness={.72} roughness={.3} /></mesh>
  </group>
  return null
}

export function CharacterBody({ unit, color, darkColor, accent }: Props) {
  const armored = armoredSkills.has(unit.skill)
  const female = unit.gender === 'female'
  const hair = female ? '#251a20' : unit.skill === 'guanxing' ? '#5f6262' : '#211b1b'
  const skin = female ? '#e4bea4' : '#d6a67f'
  const eyeWhite = female ? '#f7e7dc' : '#f0e8d5'
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
      <group position={[side * .098, 1.253, .251]} scale={[1, .62, .45]}>
        <mesh scale={[1.2, 1, .72]}><sphereGeometry args={[.039, 12, 8]} /><meshStandardMaterial color={eyeWhite} roughness={.48} /></mesh>
        <mesh position={[0, 0, .036]} scale={[.43, .7, .34]}><sphereGeometry args={[.039, 10, 8]} /><meshStandardMaterial color={female ? '#4a2630' : '#211b1b'} roughness={.28} /></mesh>
        <mesh position={[side * -.006, .008, .051]} scale={[.16, .24, .1]}><sphereGeometry args={[.039, 8, 6]} /><meshStandardMaterial color="#fffaf0" emissive="#fffaf0" emissiveIntensity={.32} /></mesh>
      </group>
      <mesh position={[side * .102, 1.319, .24]} rotation-z={side * -.13}><capsuleGeometry args={[.018, .105, 3, 10]} /><meshStandardMaterial color={hair} roughness={.95} /></mesh>
      <mesh position={[side * .145, 1.131, .214]} scale={[1, .75, .5]}><sphereGeometry args={[.075, 12, 8]} /><meshStandardMaterial color={skin} roughness={.9} /></mesh>
      <mesh position={[side * .172, 1.17, .245]} scale={[1, .45, .2]}><sphereGeometry args={[.06, 10, 7]} /><meshStandardMaterial color={female ? '#b86e73' : '#9e5f53'} transparent opacity={female ? .34 : .16} roughness={.9} /></mesh>
    </group>)}
    <mesh position={[0, 1.18, .283]} scale={[.68, 1, .68]}><coneGeometry args={[.065, .13, 8]} /><meshStandardMaterial color={skin} roughness={.9} /></mesh>
    <mesh position={[0, 1.081, .268]}><boxGeometry args={[.085, .012, .014]} /><meshStandardMaterial color="#794b40" roughness={1} /></mesh>
    {unit.skill === 'ganglie' && <group position={[-.1, 1.255, .287]}>
      <mesh scale={[1.25, .72, .3]}><sphereGeometry args={[.065, 12, 8]} /><meshStandardMaterial color="#302522" roughness={.92} /></mesh>
      <mesh position={[.1, .055, -.025]} rotation-z={-.42}><boxGeometry args={[.31, .018, .018]} /><meshStandardMaterial color="#302522" roughness={.94} /></mesh>
    </group>}
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
    <HeroRegalia skill={unit.skill} accent={accent} />
    {beardSkills.has(unit.skill) && <>
      <mesh position={[0, 1.02, .19]} scale={[unit.skill === 'wusheng' ? .65 : unit.skill === 'paoxiao' ? .92 : .75, unit.skill === 'wusheng' ? 1.5 : unit.skill === 'paoxiao' ? 1.05 : .8, .45]}><coneGeometry args={[unit.skill === 'paoxiao' ? .21 : .18, unit.skill === 'paoxiao' ? .44 : .34, 12]} /><meshStandardMaterial color={hair} roughness={1} /></mesh>
      {[-1, 1].map(side => <mesh key={`mustache-${side}`} position={[side * .085, 1.07, .276]} rotation-z={side * -.55}><capsuleGeometry args={[.021, .1, 4, 8]} /><meshStandardMaterial color={hair} roughness={1} /></mesh>)}
      {unit.skill === 'paoxiao' && [-1, 0, 1].map(index => <mesh key={`braid-${index}`} position={[index * .075, .86 - Math.abs(index) * .03, .205]} rotation-z={index * -.12}><capsuleGeometry args={[.026, .25, 5, 9]} /><meshStandardMaterial color={hair} roughness={.96} /></mesh>)}
    </>}
    <SignatureGear unit={unit} accent={accent} />
  </group>
}
