import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { HoodieModel } from './HoodieModel';
import { useCustomizerStore } from '../../store/useCustomizerStore';
import type { CameraView } from '../../types/customizer';

const CAMERA_DIRECTIONS: Record<CameraView, [number, number, number]> = {
  front: [0, 0.2, 4.5],
  back: [0, 0.2, -4.5],
  side: [4.5, 0.2, 0],
};

/** Drives camera position/distance from the store's cameraView + zoom, inside the R3F tree. */
function CameraRig() {
  const cameraView = useCustomizerStore((s) => s.cameraView);
  const zoom = useCustomizerStore((s) => s.zoom);
  const { camera } = useThree();

  useEffect(() => {
    const [x, y, z] = CAMERA_DIRECTIONS[cameraView];
    const distanceFactor = 100 / zoom;
    camera.position.set(x * distanceFactor, y * distanceFactor, z * distanceFactor);
    camera.lookAt(0, 0, 0);
  }, [camera, cameraView, zoom]);

  return null;
}

export function Scene() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas shadows camera={{ position: CAMERA_DIRECTIONS.front, fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[3, 5, 5]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-3, 2, -4]} intensity={0.3} />

        <Suspense fallback={null}>
          <Environment preset="city" />
          <HoodieModel />
        </Suspense>

        <ContactShadows position={[0, -1.4, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
        <CameraRig />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} enableZoom />
      </Canvas>
    </div>
  );
}

export default Scene;
