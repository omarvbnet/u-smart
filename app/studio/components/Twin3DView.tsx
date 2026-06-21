'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStudio } from '../lib/store';
import { getCatalogEntry, type LoadSpec } from '../lib/catalog';
import { physicalSpecFor, PX_PER_M } from '../lib/catalog/dimensions';
import { useSimulation, useDigitalTwinSync } from './hooks';
import { aggregateSimulation } from '../lib/engine/sim-metrics';
import { resolveNodes } from '../lib/model';
import type { DesignOpening, DesignGarden, DesignWall, CurtainStyle } from '../lib/model';
import { mergeEffectiveWalls } from '../lib/engine/wall-layout';
import { wall3dMaterial, ceiling3dMaterial, type CeilingMeta } from '../lib/wall-finishes';
import { openingOpenPercent, resolveFloorOpeningsFor3d } from '../lib/engine/opening-layout';
import {
  parseRoutePoints,
  computeCableRoute,
  CONDUIT_STYLE,
  conduitTypeForCable,
  type ConduitType,
} from '../lib/engine/cable-map';
import type { CableSpec } from '../lib/catalog';

function pxToM(v: number): number {
  return v / PX_PER_M;
}

/** Match WallMesh: plan wall angle → Three.js Y rotation. */
function openingRotationY(opening: DesignOpening): number {
  return -((opening.rotation ?? 0) * Math.PI) / 180;
}

function floorElevation(level: number): number {
  return level * 3;
}

function RoomMesh({
  x,
  y,
  w,
  h,
  label,
  elevation,
  ceiling,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  elevation: number;
  ceiling?: CeilingMeta;
}) {
  const cx = pxToM(x + w / 2);
  const cz = pxToM(y + h / 2);
  const mw = pxToM(w);
  const mh = pxToM(h);
  const ceilMat = ceiling3dMaterial(ceiling);
  return (
    <group position={[cx, elevation, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0.02, 0]}>
        <planeGeometry args={[mw, mh]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 2.78, 0]}>
        <planeGeometry args={[mw * 0.98, mh * 0.98]} />
        <meshStandardMaterial color={ceilMat.color} roughness={ceilMat.roughness} />
      </mesh>
      <lineSegments position={[0, 1.4, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(mw, 2.8, mh)]} />
        <lineBasicMaterial color="#64748b" />
      </lineSegments>
      <Text position={[0, 2.9, 0]} fontSize={0.25} color="#475569" anchorX="center">
        {label}
      </Text>
    </group>
  );
}

function GardenMesh({ garden, elevation }: { garden: DesignGarden; elevation: number }) {
  const cx = pxToM(garden.x + garden.width / 2);
  const cz = pxToM(garden.y + garden.height / 2);
  return (
    <group position={[cx, elevation, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[pxToM(garden.width), pxToM(garden.height)]} />
        <meshStandardMaterial color="#86efac" roughness={0.9} />
      </mesh>
      <Text position={[0, 0.5, 0]} fontSize={0.2} color="#166534" anchorX="center">
        {garden.label}
      </Text>
    </group>
  );
}

function OpeningMesh({
  opening,
  elevation,
  targetOpen,
  planX,
  planY,
}: {
  opening: DesignOpening;
  elevation: number;
  targetOpen: number;
  planX: number;
  planY: number;
}) {
  const cx = pxToM(planX);
  const cz = pxToM(planY);
  const w = Math.max(pxToM(opening.width), 0.85);
  const rotY = openingRotationY(opening);
  const doorGroup = useRef<THREE.Group>(null);
  const curtainL = useRef<THREE.Mesh>(null);
  const curtainR = useRef<THREE.Mesh>(null);
  const rollRef = useRef<THREE.Mesh>(null);
  const anim = useRef(0);

  useFrame((_, dt) => {
    anim.current = THREE.MathUtils.lerp(anim.current, targetOpen, Math.min(1, dt * 5));
    const t = anim.current / 100;
    if (opening.kind === 'door' && doorGroup.current) {
      doorGroup.current.rotation.y = -t * (Math.PI / 2.2);
    }
    const style = opening.curtainStyle ?? 'none';
    if (opening.kind === 'window' && style === 'roll' && rollRef.current) {
      rollRef.current.scale.y = Math.max(0.02, 1 - t);
    }
    if (opening.kind === 'window' && style === 'single' && curtainL.current) {
      curtainL.current.position.x = -w * 0.45 * t;
    }
    if (opening.kind === 'window' && style === 'double') {
      if (curtainL.current) curtainL.current.position.x = -w * 0.22 * t;
      if (curtainR.current) curtainR.current.position.x = w * 0.22 * t;
    }
  });

  if (opening.kind === 'door') {
    return (
      <group position={[cx, elevation, cz]} rotation={[0, rotY, 0]} renderOrder={10}>
        <mesh position={[0, 1.1, 0]} castShadow renderOrder={10}>
          <boxGeometry args={[w, 2.2, 0.12]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <group ref={doorGroup} position={[w / 2 - 0.05, 1.1, 0.04]}>
          <mesh castShadow renderOrder={11}>
            <boxGeometry args={[w * 0.92, 2.05, 0.08]} />
            <meshStandardMaterial color="#d97706" emissive="#92400e" emissiveIntensity={0.15} />
          </mesh>
        </group>
      </group>
    );
  }

  const style: CurtainStyle = opening.curtainStyle ?? 'none';
  return (
    <group position={[cx, elevation + 1.05, cz]} rotation={[0, rotY, 0]} renderOrder={10}>
      <mesh castShadow renderOrder={10}>
        <boxGeometry args={[w + 0.08, 1.35, 0.1]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0, 0.02]} renderOrder={11}>
        <boxGeometry args={[w, 1.2, 0.04]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {style === 'roll' && (
        <mesh ref={rollRef} position={[0, 0.5, 0.04]}>
          <boxGeometry args={[w * 0.92, 1, 0.02]} />
          <meshStandardMaterial color="#1e293b" transparent opacity={0.7} />
        </mesh>
      )}
      {style === 'single' && (
        <mesh ref={curtainL} position={[0, 0, 0.04]}>
          <boxGeometry args={[w * 0.45, 1.05, 0.02]} />
          <meshStandardMaterial color="#1e293b" transparent opacity={0.75} />
        </mesh>
      )}
      {style === 'double' && (
        <>
          <mesh ref={curtainL} position={[-w * 0.22, 0, 0.04]}>
            <boxGeometry args={[w * 0.44, 1.05, 0.02]} />
            <meshStandardMaterial color="#1e293b" transparent opacity={0.75} />
          </mesh>
          <mesh ref={curtainR} position={[w * 0.22, 0, 0.04]}>
            <boxGeometry args={[w * 0.44, 1.05, 0.02]} />
            <meshStandardMaterial color="#1e293b" transparent opacity={0.75} />
          </mesh>
        </>
      )}
    </group>
  );
}

function WallMesh({ wall, elevation }: { wall: DesignWall; elevation: number }) {
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const cx = pxToM((wall.x1 + wall.x2) / 2);
  const cz = pxToM((wall.y1 + wall.y2) / 2);
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  const heightM = wall.heightM ?? 2.8;
  const mat = wall3dMaterial(wall);
  return (
    <mesh position={[cx, elevation + heightM / 2, cz]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[pxToM(len), heightM, pxToM(Math.max(4, wall.thickness * 4))]} />
      <meshStandardMaterial
        color={mat.color}
        roughness={mat.roughness}
        metalness={mat.metalness}
        transparent={mat.transparent}
        opacity={mat.opacity}
      />
    </mesh>
  );
}

function LightFixture3D({
  x,
  y,
  entry,
  active,
  level,
  elevation,
}: {
  x: number;
  y: number;
  entry: LoadSpec;
  active: boolean;
  level: number;
  elevation: number;
}) {
  const type = entry.lightingType ?? 'DOWNLIGHT';
  const intensity = active ? (level / 100) * 1.5 : 0;
  const pos: [number, number, number] = [pxToM(x), elevation + 2.5, pxToM(y)];

  if (type === 'LINEAR') {
    const len = (entry.lengthMm ?? 1200) / 1000;
    return (
      <group position={pos}>
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[len, 0.04, 0.08]} />
          <meshStandardMaterial color="#fde047" emissive={active ? '#fde047' : '#000'} emissiveIntensity={active ? 0.6 : 0} />
        </mesh>
        {active && <rectAreaLight width={len} height={0.3} intensity={intensity * 2} color="#fff7cc" position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} />}
      </group>
    );
  }

  if (type === 'SPOT') {
    const beam = ((entry.beamAngleDeg ?? 24) * Math.PI) / 180;
    return (
      <group position={pos}>
        <mesh>
          <cylinderGeometry args={[0.04, 0.06, 0.1, 12]} />
          <meshStandardMaterial color="#fbbf24" emissive={active ? '#fbbf24' : '#000'} emissiveIntensity={active ? 0.8 : 0} />
        </mesh>
        {active && <spotLight intensity={intensity * 3} angle={beam / 2} penumbra={0.4} distance={6} color="#fffbeb" castShadow />}
      </group>
    );
  }

  if (type === 'MAGNETIC') {
    const trackLen = 0.6;
    return (
      <group position={pos}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[trackLen, 0.03, 0.05]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
        {[-0.2, 0, 0.2].map((ox) => (
          <group key={ox} position={[ox, -0.08, 0]}>
            <mesh>
              <boxGeometry args={[0.06, 0.08, 0.06]} />
              <meshStandardMaterial color="#eab308" emissive={active ? '#eab308' : '#000'} emissiveIntensity={active ? 0.7 : 0} />
            </mesh>
            {active && <pointLight intensity={intensity} distance={3} color="#fef08a" />}
          </group>
        ))}
      </group>
    );
  }

  return (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 16]} />
        <meshStandardMaterial color="#facc15" emissive={active ? '#fde047' : '#000'} emissiveIntensity={active ? 0.9 : 0} />
      </mesh>
      {active && <pointLight intensity={intensity * 1.2} distance={4} color="#fde047" castShadow />}
    </group>
  );
}

function DeviceMesh({
  x,
  y,
  catalogId,
  label,
  active,
  level,
  elevation,
}: {
  x: number;
  y: number;
  catalogId: string;
  label: string;
  active: boolean;
  level: number;
  elevation: number;
}) {
  const entry = getCatalogEntry(catalogId);
  if (entry?.domain === 'load' && entry.category === 'LIGHTING') {
    return <LightFixture3D x={x} y={y} entry={entry as LoadSpec} active={active} level={level} elevation={elevation} />;
  }

  const phys = entry ? physicalSpecFor(entry) : { widthMm: 100, heightMm: 100, depthMm: 50, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'wall' as const };
  const w = phys.widthMm / 1000;
  const h = phys.heightMm / 1000;
  const d = phys.depthMm / 1000;
  const mountY = phys.mount === 'ceiling' ? 2.5 : phys.mount === 'wall' ? 1.2 : 0.4;
  const color = entry?.color ?? '#64748b';

  return (
    <group position={[pxToM(x), elevation + mountY, pxToM(y)]}>
      <mesh castShadow>
        <boxGeometry args={[Math.max(0.08, w), Math.max(0.08, h), Math.max(0.06, d)]} />
        <meshStandardMaterial color={color} emissive={active ? '#22d3ee' : '#000000'} emissiveIntensity={active ? 0.4 : 0} />
      </mesh>
      <Text position={[0, h / 2 + 0.15, 0]} fontSize={0.12} color="#334155" anchorX="center">
        {label.slice(0, 14)}
      </Text>
    </group>
  );
}

function CableSegment3D({
  x1,
  y1,
  x2,
  y2,
  elevation,
  outerRadius,
  innerRadius,
  outerColor,
  innerColor,
  showPipe,
  showCable,
  active,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  elevation: number;
  outerRadius: number;
  innerRadius: number;
  outerColor: string;
  innerColor: string;
  showPipe: boolean;
  showCable: boolean;
  active: boolean;
}) {
  const ax = pxToM(x1);
  const az = pxToM(y1);
  const bx = pxToM(x2);
  const bz = pxToM(y2);
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const midX = (ax + bx) / 2;
  const midZ = (az + bz) / 2;
  const angle = Math.atan2(dz, dx);
  const h = elevation + 0.06;

  return (
    <group position={[midX, h, midZ]} rotation={[0, -angle, 0]}>
      {showPipe && (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[outerRadius, outerRadius, len, 10]} />
          <meshStandardMaterial color={outerColor} transparent opacity={0.55} />
        </mesh>
      )}
      {showCable && (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[innerRadius, innerRadius, len, 8]} />
          <meshStandardMaterial
            color={active ? '#22c55e' : innerColor}
            emissive={active ? '#22c55e' : '#000000'}
            emissiveIntensity={active ? 0.5 : 0}
          />
        </mesh>
      )}
    </group>
  );
}

function CableRun3D({
  points,
  conduitType,
  catalogId,
  elevation,
  overlayMode,
  active,
}: {
  points: { x: number; y: number }[];
  conduitType: ConduitType;
  catalogId: string;
  elevation: number;
  overlayMode: string;
  active: boolean;
}) {
  const entry = getCatalogEntry(catalogId) as CableSpec | undefined;
  const style = CONDUIT_STYLE[conduitType] ?? CONDUIT_STYLE.conduit;
  const showPipe = overlayMode === 'pipes' || overlayMode === 'combined';
  const showCable = overlayMode === 'cables' || overlayMode === 'combined';
  const outerRadius = style.outerPx / 1800;
  const innerRadius = Math.max(0.008, outerRadius * 0.35);
  const innerColor = entry?.color ?? '#f59e0b';

  return (
    <>
      {points.slice(0, -1).map((p, i) => {
        const n = points[i + 1]!;
        return (
          <CableSegment3D
            key={i}
            x1={p.x}
            y1={p.y}
            x2={n.x}
            y2={n.y}
            elevation={elevation}
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            outerColor={style.color}
            innerColor={innerColor}
            showPipe={showPipe}
            showCable={showCable}
            active={active}
          />
        );
      })}
    </>
  );
}

function SceneContent() {
  const rooms = useStudio((s) => s.rooms);
  const nodes = useStudio((s) => s.nodes);
  const bim = useStudio((s) => s.bim);
  const project = useStudio((s) => s.project);
  const floors = useStudio((s) => s.floors);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const controls = useStudio((s) => s.controls);
  const edges = useStudio((s) => s.edges);
  const showCableRoutes3d = useStudio((s) => s.showCableRoutes3d);
  const showOutletsOnMap = useStudio((s) => s.showOutletsOnMap);
  const mapOverlayMode = useStudio((s) => s.mapOverlayMode);
  const sim = useSimulation();
  const simulating = useStudio((s) => s.simulating);
  const { twinConnected } = useDigitalTwinSync();

  const floorLevel = floors.find((f) => f.id === activeFloorId)?.level ?? 0;
  const elevation = floorElevation(floorLevel);

  const visibleRooms = useMemo(
    () => rooms.filter((r) => !r.floorId || r.floorId === activeFloorId),
    [rooms, activeFloorId],
  );

  const sceneCenter = useMemo(() => {
    if (!visibleRooms.length) return { x: 0, z: 0, span: 12 };
    const minX = Math.min(...visibleRooms.map((r) => r.x));
    const maxX = Math.max(...visibleRooms.map((r) => r.x + r.width));
    const minY = Math.min(...visibleRooms.map((r) => r.y));
    const maxY = Math.max(...visibleRooms.map((r) => r.y + r.height));
    const cx = pxToM((minX + maxX) / 2);
    const cz = pxToM((minY + maxY) / 2);
    const span = Math.max(pxToM(maxX - minX), pxToM(maxY - minY), 8);
    return { x: cx, z: cz, span };
  }, [visibleRooms]);

  const metrics = useMemo(() => {
    if (!simulating) return null;
    return aggregateSimulation(resolveNodes(nodes, getCatalogEntry), sim);
  }, [nodes, sim, simulating]);

  const devices = useMemo(
    () => nodes.filter((n) => {
      const e = getCatalogEntry(n.catalogId);
      if (!e || e.domain === 'cable') return false;
      if (e.category === 'SOCKET' || e.category === 'APPLIANCE') return false;
      return !n.floorId || n.floorId === activeFloorId;
    }),
    [nodes, activeFloorId],
  );

  const walls = useMemo(
    () => mergeEffectiveWalls(bim, rooms, activeFloorId),
    [bim, rooms, activeFloorId],
  );
  const openings3d = useMemo(
    () => resolveFloorOpeningsFor3d(bim, rooms, activeFloorId, project),
    [bim, rooms, activeFloorId, project],
  );
  const gardens = bim?.gardens?.filter((g) => !g.floorId || g.floorId === activeFloorId) ?? [];

  const cableRuns = useMemo(() => {
    if (!showCableRoutes3d || mapOverlayMode === 'plan') return [];
    return nodes
      .filter((n) => {
        if (n.floorId && n.floorId !== activeFloorId) return false;
        const e = getCatalogEntry(n.catalogId);
        return e?.domain === 'cable' && n.params.showOnMap !== false;
      })
      .map((n) => {
        let points = parseRoutePoints(n.params);
        if (points.length < 2) points = computeCableRoute(n, nodes, edges, rooms);
        const entry = getCatalogEntry(n.catalogId) as CableSpec;
        const conduitType = (n.params.conduitType as ConduitType | undefined) ?? conduitTypeForCable(entry);
        return { id: n.id, points, conduitType, catalogId: n.catalogId, active: !!sim[n.id]?.active };
      });
  }, [nodes, edges, rooms, activeFloorId, showCableRoutes3d, mapOverlayMode, sim]);

  const mapOutlets = useMemo(() => {
    if (!showOutletsOnMap) return [];
    return nodes.filter((n) => {
      if (n.floorId && n.floorId !== activeFloorId) return false;
      if (n.params.showOnMap === false) return false;
      const e = getCatalogEntry(n.catalogId);
      return e?.category === 'SOCKET' || e?.category === 'APPLIANCE';
    });
  }, [nodes, activeFloorId, showOutletsOnMap]);

  return (
    <>
      {metrics && (
        <Text position={[sceneCenter.x - 4, 4 + elevation, sceneCenter.z]} fontSize={0.22} color="#22d3ee" anchorX="left">
          {`${metrics.totalKw.toFixed(2)} kW · ${metrics.totalA.toFixed(1)} A · ${metrics.activeDevices} active${twinConnected ? ' · twin' : ''}`}
        </Text>
      )}
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.45} color="#f8fafc" groundColor="#334155" />
      <directionalLight position={[8, 12 + elevation, 6]} intensity={0.85} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sceneCenter.x, elevation - 0.01, sceneCenter.z]} receiveShadow>
        <planeGeometry args={[Math.max(40, sceneCenter.span * 2.5), Math.max(40, sceneCenter.span * 2.5)]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      {gardens.map((g) => (
        <GardenMesh key={g.id} garden={g} elevation={elevation} />
      ))}
      {visibleRooms.map((r) => (
        <RoomMesh
          key={r.id}
          x={r.x}
          y={r.y}
          w={r.width}
          h={r.height}
          label={r.label}
          elevation={elevation}
          ceiling={bim?.ceilingMeta?.[r.id]}
        />
      ))}
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} elevation={elevation} />
      ))}
      {openings3d.map(({ opening, x, y }) => (
        <OpeningMesh
          key={opening.id}
          opening={opening}
          planX={x}
          planY={y}
          elevation={elevation}
          targetOpen={openingOpenPercent(opening, controls)}
        />
      ))}
      {cableRuns.map((run) => (
        <CableRun3D
          key={run.id}
          points={run.points}
          conduitType={run.conduitType}
          catalogId={run.catalogId}
          elevation={elevation}
          overlayMode={mapOverlayMode}
          active={run.active}
        />
      ))}
      {mapOutlets.map((n) => {
        const entry = getCatalogEntry(n.catalogId);
        const isAppliance = entry?.category === 'APPLIANCE';
        return (
          <mesh
            key={n.id}
            position={[pxToM(n.x + 21), elevation + (isAppliance ? 0.45 : 0.35), pxToM(n.y + 21)]}
            castShadow
          >
            <boxGeometry args={[isAppliance ? 0.5 : 0.12, isAppliance ? 0.85 : 0.08, isAppliance ? 0.5 : 0.04]} />
            <meshStandardMaterial color={entry?.color ?? '#eab308'} />
          </mesh>
        );
      })}
      {devices.map((n) => {
        const s = sim[n.id];
        const ctrl = controls[n.id];
        const level = typeof ctrl?.level === 'number' ? ctrl.level : 100;
        return (
          <DeviceMesh
            key={n.id}
            x={n.x}
            y={n.y}
            catalogId={n.catalogId}
            label={n.label}
            active={simulating && !!s?.active}
            level={level}
            elevation={elevation}
          />
        );
      })}
      <PerspectiveCamera
        makeDefault
        position={[
          sceneCenter.x + sceneCenter.span * 0.55,
          elevation + sceneCenter.span * 0.45,
          sceneCenter.z + sceneCenter.span * 0.55,
        ]}
        fov={48}
        near={0.1}
        far={500}
      />
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2}
        maxDistance={Math.max(24, sceneCenter.span * 3)}
        target={[sceneCenter.x, elevation + 1.4, sceneCenter.z]}
      />
    </>
  );
}

/** Interactive 3D digital twin — rooms, equipment, typed lighting effects, BIM openings. */
export function Twin3DView() {
  const rooms = useStudio((s) => s.rooms);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const visibleRooms = rooms.filter((r) => !r.floorId || r.floorId === activeFloorId);

  return (
    <div className="absolute inset-0 min-h-0 bg-[var(--studio-bg)]">
      {visibleRooms.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
          <div className="rounded-xl border border-dashed border-[var(--studio-border)] bg-[var(--studio-panel)]/90 px-6 py-4 text-sm text-[var(--studio-muted)]">
            Add rooms on the 2D plan first, then switch back to 3D twin view.
          </div>
        </div>
      )}
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-[var(--studio-muted)]">Loading 3D twin…</div>
        }
      >
        <Canvas shadows dpr={[1, 1.5]} className="!h-full !w-full">
          <SceneContent />
        </Canvas>
      </Suspense>
    </div>
  );
}
