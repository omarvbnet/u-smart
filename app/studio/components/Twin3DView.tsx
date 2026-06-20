'use client';

import { Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useStudio } from '../lib/store';
import { getCatalogEntry } from '../lib/catalog';
import { physicalSpecFor, PX_PER_M } from '../lib/catalog/dimensions';
import { useSimulation } from './hooks';

function pxToM(v: number): number {
  return v / PX_PER_M;
}

function RoomMesh({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) {
  const cx = pxToM(x + w / 2);
  const cz = pxToM(y + h / 2);
  const mw = pxToM(w);
  const mh = pxToM(h);
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[mw, mh]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0.85} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(mw, 2.8, mh)]} />
        <lineBasicMaterial color="#64748b" />
      </lineSegments>
      <Text position={[0, 2.9, 0]} fontSize={0.25} color="#475569" anchorX="center">
        {label}
      </Text>
    </group>
  );
}

function DeviceMesh({ x, y, catalogId, label, active }: { x: number; y: number; catalogId: string; label: string; active: boolean }) {
  const entry = getCatalogEntry(catalogId);
  const phys = entry ? physicalSpecFor(entry) : { widthMm: 100, heightMm: 100, depthMm: 50, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'wall' as const };
  const w = phys.widthMm / 1000;
  const h = phys.heightMm / 1000;
  const d = phys.depthMm / 1000;
  const mountY = phys.mount === 'ceiling' ? 2.5 : phys.mount === 'wall' ? 1.2 : 0.4;
  const color = entry?.color ?? '#64748b';

  return (
    <group position={[pxToM(x), mountY, pxToM(y)]}>
      <mesh castShadow>
        <boxGeometry args={[Math.max(0.08, w), Math.max(0.08, h), Math.max(0.06, d)]} />
        <meshStandardMaterial color={color} emissive={active ? '#fde047' : '#000000'} emissiveIntensity={active ? 0.8 : 0} />
      </mesh>
      {active && entry?.domain === 'load' && entry.category === 'LIGHTING' && (
        <pointLight intensity={1.2} distance={4} color="#fde047" />
      )}
      <Text position={[0, h / 2 + 0.15, 0]} fontSize={0.12} color="#334155" anchorX="center">
        {label.slice(0, 14)}
      </Text>
    </group>
  );
}

function SceneContent() {
  const rooms = useStudio((s) => s.rooms);
  const nodes = useStudio((s) => s.nodes);
  const sim = useSimulation();
  const simulating = useStudio((s) => s.simulating);

  useFrame(() => {});

  const devices = useMemo(
    () => nodes.filter((n) => getCatalogEntry(n.catalogId)?.domain !== 'cable'),
    [nodes],
  );

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 12, 6]} intensity={0.9} castShadow />
      <Environment preset="apartment" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      {rooms.map((r) => (
        <RoomMesh key={r.id} x={r.x} y={r.y} w={r.width} h={r.height} label={r.label} />
      ))}
      {devices.map((n) => (
        <DeviceMesh
          key={n.id}
          x={n.x}
          y={n.y}
          catalogId={n.catalogId}
          label={n.label}
          active={simulating && !!sim[n.id]?.active}
        />
      ))}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={40} />
    </>
  );
}

/** Interactive 3D digital twin — rooms, equipment, live lighting when simulating. */
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
