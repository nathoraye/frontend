import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Decal, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';

/** 1×1 transparent PNG so useTexture always receives a valid source (hooks cannot be conditional). */
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export interface ShirtColorOption {
  id: string;
  label: string;
  hex: string;
}

export const SHIRT_COLOR_PALETTE: readonly ShirtColorOption[] = [
  { id: 'black', label: 'Black', hex: '#111111' },
  { id: 'white', label: 'White', hex: '#f5f5f5' },
  { id: 'heather-grey', label: 'Heather Grey', hex: '#9e9e9e' },
  { id: 'navy', label: 'Navy', hex: '#1a237e' },
  { id: 'red', label: 'Red', hex: '#c62828' },
  { id: 'forest', label: 'Forest', hex: '#2e7d32' },
  { id: 'sand', label: 'Sand', hex: '#d7ccc8' },
] as const;

export interface ThreeMockupViewerProps {
  /** Fabric.js canvas export as a PNG data URL (or null when empty). */
  designDataUrl: string | null;
  onClose: () => void;
}

/** Procedural front-facing T-shirt silhouette extruded into a shallow 3D garment. */
function createTShirtGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();

  // Coordinates are in local units; origin is roughly the garment center.
  // Outline goes clockwise from the left sleeve tip, around the hem, and back.
  shape.moveTo(-1.55, 0.55); // left sleeve outer tip
  shape.lineTo(-0.72, 0.85); // left shoulder
  shape.lineTo(-0.38, 1.05); // left collar
  shape.quadraticCurveTo(0, 0.88, 0.38, 1.05); // neckline
  shape.lineTo(0.72, 0.85); // right shoulder
  shape.lineTo(1.55, 0.55); // right sleeve outer tip
  shape.lineTo(1.45, 0.15); // right sleeve hem
  shape.lineTo(0.72, 0.4); // right armpit
  shape.lineTo(0.7, -1.15); // right hem
  shape.lineTo(-0.7, -1.15); // left hem
  shape.lineTo(-0.72, 0.4); // left armpit
  shape.lineTo(-1.45, 0.15); // left sleeve hem
  shape.lineTo(-1.55, 0.55); // close

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 12,
  });

  geometry.center();
  // Face the camera (+Z) and sit upright.
  geometry.rotateX(0);
  geometry.computeVertexNormals();
  return geometry;
}

interface TShirtMeshProps {
  color: string;
  designDataUrl: string | null;
}

function TShirtMesh({ color, designDataUrl }: TShirtMeshProps) {
  const geometry = useMemo(() => createTShirtGeometry(), []);
  const texture = useTexture(designDataUrl ?? BLANK_PIXEL);

  // ExtrudeGeometry depth is along +Z after center(); chest sits on the front face.
  const decalPosition = useMemo<[number, number, number]>(() => [0, 0.12, 0.16], []);
  const decalRotation = useMemo<[number, number, number]>(() => [0, 0, 0], []);
  const decalScale = useMemo<[number, number, number]>(() => [0.95, 0.95, 0.4], []);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
      {designDataUrl ? (
        <Decal position={decalPosition} rotation={decalRotation} scale={decalScale}>
          <meshStandardMaterial
            map={texture}
            transparent
            polygonOffset
            polygonOffsetFactor={-4}
            roughness={0.9}
            metalness={0}
          />
        </Decal>
      ) : null}
    </mesh>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[3.5, 6, 4]}
        intensity={1.15}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />
      <directionalLight position={[0, -2, 3]} intensity={0.2} />
    </>
  );
}

interface MockupCanvasProps {
  color: string;
  designDataUrl: string | null;
}

function MockupCanvas({ color, designDataUrl }: MockupCanvasProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0.2, 4.2], fov: 40, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true }}
      className="touch-none"
    >
      <color attach="background" args={['#0f111a']} />
      <SceneLights />
      <Suspense fallback={null}>
        <group position={[0, 0.05, 0]}>
          <TShirtMesh color={color} designDataUrl={designDataUrl} />
        </group>
        <ContactShadows
          position={[0, -1.35, 0]}
          opacity={0.55}
          scale={8}
          blur={2.4}
          far={4}
          resolution={256}
          color="#000000"
        />
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableRotate
        // Touch: one-finger rotate, two-finger pinch zoom (drei defaults; zoom clamped below).
        minDistance={2.2}
        maxDistance={7.5}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.55}
        target={[0, 0.05, 0]}
      />
    </Canvas>
  );
}

export function ThreeMockupViewer({ designDataUrl, onClose }: ThreeMockupViewerProps) {
  const [shirtColor, setShirtColor] = useState<string>(SHIRT_COLOR_PALETTE[0].hex);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="3D apparel mockup preview"
    >
      <div className="flex h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#181a25] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-5 py-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-100">3D Preview</h2>
            <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Drag to rotate · Pinch / scroll to zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white"
            aria-label="Close 3D preview"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-[#0f111a]">
          <MockupCanvas color={shirtColor} designDataUrl={designDataUrl} />
          {!designDataUrl && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <span className="rounded-md border border-slate-700 bg-[#181a25]/90 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                No design on canvas — add artwork in 2D Studio
              </span>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-700 px-5 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shirt colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {SHIRT_COLOR_PALETTE.map((option) => {
              const selected = shirtColor === option.hex;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={selected}
                  onClick={() => setShirtColor(option.hex)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                    selected ? 'border-[#FF1493] ring-2 ring-[#FF1493]/30' : 'border-slate-600'
                  }`}
                  style={{ backgroundColor: option.hex }}
                />
              );
            })}
          </div>
          <span className="ml-auto hidden text-[10px] font-mono text-slate-500 sm:inline">
            {SHIRT_COLOR_PALETTE.find((c) => c.hex === shirtColor)?.label ?? 'Custom'}
          </span>
        </footer>
      </div>
    </div>
  );
}

export default ThreeMockupViewer;
