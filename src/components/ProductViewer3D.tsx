import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Decal, useTexture } from '@react-three/drei';
import { PRODUCT_CATALOG, type ProductId } from '../three/productCatalog';

// 1x1 transparent PNG used so useTexture always has a valid source (hooks can't be conditional).
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export interface ProductPlacement {
  posX: number;
  posY: number;
  scale: number;
  rotationDeg: number;
}

export interface ProductViewer3DProps {
  productId: ProductId;
  color: string;
  activeView: string;
  designDataUrl: string | null;
  placement: ProductPlacement;
}

function ProductMesh({ productId, color, activeView, designDataUrl, placement }: ProductViewer3DProps) {
  const product = PRODUCT_CATALOG[productId];
  const anchor = product.decalAnchors[activeView] ?? Object.values(product.decalAnchors)[0];
  const texture = useTexture(designDataUrl ?? BLANK_PIXEL);

  const decalPosition = useMemo<[number, number, number]>(() => {
    const [x, y, z] = anchor.position;
    return [
      x + (placement.posX / 100) * anchor.size[0],
      y - (placement.posY / 100) * anchor.size[1],
      z,
    ];
  }, [anchor, placement.posX, placement.posY]);

  const decalRotation = useMemo<[number, number, number]>(() => {
    const [rx, ry, rz] = anchor.rotation;
    return [rx, ry, rz + (placement.rotationDeg * Math.PI) / 180];
  }, [anchor, placement.rotationDeg]);

  const decalScale = useMemo<[number, number, number]>(() => {
    const [sx, sy, sz] = anchor.size;
    return [sx * placement.scale, sy * placement.scale, sz];
  }, [anchor, placement.scale]);

  return (
    <mesh>
      {product.geometry === 'box' ? (
        <boxGeometry args={product.dimensions} />
      ) : (
        <cylinderGeometry args={[product.dimensions[0], product.dimensions[1], product.dimensions[2], 32]} />
      )}
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
      {designDataUrl && (
        <Decal position={decalPosition} rotation={decalRotation} scale={decalScale}>
          <meshStandardMaterial map={texture} transparent polygonOffset polygonOffsetFactor={-4} roughness={0.9} />
        </Decal>
      )}
    </mesh>
  );
}

/** Placeholder 3D product preview (primitive geometry) with the current design applied as a decal. */
export function ProductViewer3D(props: ProductViewer3DProps) {
  return (
    <div className="w-full h-full min-h-[320px]">
      <Canvas camera={{ position: [0, 0, 4.5], fov: 40 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 5]} intensity={0.7} />
        <directionalLight position={[-3, -2, -4]} intensity={0.3} />
        <Suspense fallback={null}>
          <ProductMesh {...props} />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={2} maxDistance={8} />
      </Canvas>
    </div>
  );
}

export default ProductViewer3D;
