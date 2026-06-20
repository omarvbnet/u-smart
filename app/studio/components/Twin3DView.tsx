'use client';

import { Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStudio } from '../lib/store';
import { getCatalogEntry, type LoadSpec } from '../lib/catalog';
import { physicalSpecFor, PX_PER_M } from '../lib/catalog/dimensions';
import { useSimulation, useDigitalTwinSync } from './hooks';
import { aggregateSimulation } from '../lib/engine/sim-metrics';
import { resolveNodes } from '../lib/model';
import type { DesignOpening, DesignGarden, DesignWall } from '../lib/model';
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

function floorElevation(level: number): number {
  return level * 3;
}

function RoomMesh({ x, y, w, h, label, elevation }: { x: number; y: number; w: number; h: number; label: string; elevation: number }) {
  const cx = pxToM(x + w / 2);
  const cz = pxToM(y + h / 2);
  const mw = pxToM(w);
  const mh = pxToM(h);
  return (
    <group position={[cx, elevation, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0.02, 0]}>
        <planeGeometry args={[mw, mh]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0.85} />
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

function OpeningMesh({ opening, elevation }: { opening: DesignOpening; elevation: number }) {
  const cx = pxToM(opening.x);
  const cz = pxToM(opening.y);
  const color = opening.kind === 'door' ? '#d97706' : '#38bdf8';
  return (
    <mesh position={[cx, elevation + (opening.kind === 'door' ? 1.1 : 1.4), cz]} castShadow>
      <boxGeometry args={[pxToM(opening.width), opening.kind === 'door' ? 2.2 : 1.2, 0.12]} />
      <meshStandardMaterial color={color} transparent opacity={opening.kind === 'window' ? 0.5 : 0.9} />
    </mesh>
  );
}

function WallMesh({ wall, elevation }: { wall: DesignWall; elevation: number }) {
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const cx = pxToM((wall.x1 + wall.x2) / 2);
  const cz = pxToM((wall.y1 + wall.y2) / 2);
  const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
  return (
    <mesh position={[cx, elevation + 1.4, cz]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[pxToM(len), 2.8, pxToM(Math.max(4, wall.thickness * 4))]} />
      <meshStandardMaterial color="#94a3b8" />
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

  const metrics = useMemo(() => {
    if (!simulating) return null;
    return aggregateSimulation(resolveNodes(nodes, getCatalogEntry), sim);
  }, [nodes, sim, simulating]);

  useFrame(() => {});

  const devices = useMemo(
    () => nodes.filter((n) => {
      const e = getCatalogEntry(n.catalogId);
      if (!e || e.domain === 'cable') return false;
      if (e.category === 'SOCKET' || e.category === 'APPLIANCE') return false;
      return !n.floorId || n.floorId === activeFloorId;
    }),
    [nodes, activeFloorId],
  );

  const walls = bim?.walls.filter((w) => !w.floorId || w.floorId === activeFloorId) ?? [];
  const openings = bim?.openings.filter((o) => !o.floorId || o.floorId === activeFloorId) ?? [];
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
        <Text position={[-4, 4 + elevation, 0]} fontSize={0.22} color="#22d3ee" anchorX="left">
          {`${metrics.totalKw.toFixed(2)} kW · ${metrics.totalA.toFixed(1)} A · ${metrics.activeDevices} active${twinConnected ? ' · twin' : ''}`}
        </Text>
      )}
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 12 + elevation, 6]} intensity={0.9} castShadow />
      <Environment preset="apartment" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation - 0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      {gardens.map((g) => (
        <GardenMesh key={g.id} garden={g} elevation={elevation} />
      ))}
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} elevation={elevation} />
      ))}
      {openings.map((o) => (
        <OpeningMesh key={o.id} opening={o} elevation={elevation} />
      ))}
      {visibleRooms.map((r) => (
        <RoomMesh key={r.id} x={r.x} y={r.y} w={r.width} h={r.height} label={r.label} elevation={elevation} />
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
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={40} target={[0, elevation, 0]} />
    </>
  );
}

/** Interactive 3D digital twin — rooms, equipment, typed lighting effects, BIM openings. */
export function Twin3DView() {
  return (
    <div className="h-full w-full bg-[var(--studio-bg)]">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--studio-muted)]">Loading 3D twin…</div>}>
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={[6, 8, 10]} fov={50} />
          <SceneContent />
        </Canvas>
      </Suspense>
    </div>
  );
}
