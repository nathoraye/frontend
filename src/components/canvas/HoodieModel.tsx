import { useMemo } from 'react';
import { useFrame, useGraph } from '@react-three/fiber';
import { Decal, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils, type GLTF } from 'three-stdlib';
import { useCustomizerStore } from '../../store/useCustomizerStore';
import { useFabricCanvasTexture } from '../../hooks/useFabricCanvasTexture';
import type { DecalConfig, PlacementZone } from '../../types/customizer';

/**
 * Sourced from poly.pizza ("Casual" character by Quaternius, CC0) at public/models/hoodie.glb.
 * Node/material names below come from `npx gltfjsx public/models/hoodie.glb -t`.
 */
const HOODIE_MODEL_PATH = '/models/hoodie.glb';

type HoodieGLTF = GLTF & {
  nodes: {
    Casual_Feet_1: THREE.SkinnedMesh;
    Casual_Feet_2: THREE.SkinnedMesh;
    Casual_Legs_1: THREE.SkinnedMesh;
    Casual_Legs_2: THREE.SkinnedMesh;
    Casual_Head_1: THREE.SkinnedMesh;
    Casual_Head_2: THREE.SkinnedMesh;
    Casual_Head_3: THREE.SkinnedMesh;
    Casual_Head_4: THREE.SkinnedMesh;
    Casual_Body_1: THREE.SkinnedMesh;
    Casual_Body_2: THREE.SkinnedMesh;
    Root: THREE.Bone;
  };
  materials: {
    White: THREE.MeshStandardMaterial;
    Purple: THREE.MeshStandardMaterial;
    Skin: THREE.MeshStandardMaterial;
    LightBlue: THREE.MeshStandardMaterial;
    Eyebrows: THREE.MeshStandardMaterial;
    Eye: THREE.MeshStandardMaterial;
    Hair: THREE.MeshStandardMaterial;
  };
};

interface GarmentAnchor {
  /** Local-space position on the Casual_Body_1 (hoodie) mesh surface. */
  position: [number, number, number];
  /** Local-space rotation (radians) so the decal faces outward from the torso surface. */
  rotation: [number, number, number];
  size: [number, number, number];
}

/**
 * Derives placement anchors from the garment mesh's own bounding box instead of hardcoded
 * world-space numbers, so anchors stay valid if the source geometry is swapped later.
 * Axis mapping for this asset: local X = width, local Y = front(-)/back(+) depth, local Z = height.
 */
function useGarmentAnchors(geometry: THREE.BufferGeometry | undefined): Record<PlacementZone, GarmentAnchor> | null {
  return useMemo(() => {
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return null;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const chestZ = box.min.z + size.z * 0.66;
    const pocketZ = box.min.z + size.z * 0.38;

    return {
      chest: {
        position: [center.x, box.min.y, chestZ],
        rotation: [-Math.PI / 2, 0, 0],
        size: [size.x * 0.35, size.z * 0.3, 1],
      },
      pocket: {
        position: [center.x, box.min.y, pocketZ],
        rotation: [-Math.PI / 2, 0, 0],
        size: [size.x * 0.22, size.z * 0.18, 1],
      },
      back: {
        position: [center.x, box.max.y, chestZ],
        rotation: [Math.PI / 2, 0, 0],
        size: [size.x * 0.4, size.z * 0.35, 1],
      },
      sleeve: {
        position: [box.max.x * 0.82, center.y, chestZ],
        rotation: [0, 0, -Math.PI / 2],
        size: [size.z * 0.18, size.z * 0.18, 1],
      },
    };
  }, [geometry]);
}

function DecalMesh({ decal, anchors }: { decal: DecalConfig; anchors: Record<PlacementZone, GarmentAnchor> }) {
  const texture = useTexture(decal.imageUrl);
  const anchor = anchors[decal.placement];

  const position = useMemo<[number, number, number]>(() => {
    const [x, y, z] = anchor.position;
    return [x + (decal.position.x / 100) * anchor.size[0], y, z - (decal.position.y / 100) * anchor.size[1]];
  }, [anchor, decal.position.x, decal.position.y]);

  const scale = useMemo<[number, number, number]>(() => {
    const [sx, sy, sz] = anchor.size;
    return [sx * decal.scale, sy * decal.scale, sz];
  }, [anchor, decal.scale]);

  return (
    <Decal position={position} rotation={anchor.rotation} scale={scale}>
      <meshStandardMaterial
        map={texture}
        transparent
        opacity={decal.opacity}
        polygonOffset
        polygonOffsetFactor={-4}
        roughness={0.9}
        depthTest
      />
    </Decal>
  );
}

/** Projects the live Fabric.js canvas (see useFabricCanvasTexture) onto the chest in real time. */
function FabricLiveDecal({ anchor }: { anchor: GarmentAnchor }) {
  const texture = useFabricCanvasTexture();
  if (!texture) return null;

  return (
    <Decal position={anchor.position} rotation={anchor.rotation} scale={anchor.size}>
      <meshStandardMaterial map={texture} transparent polygonOffset polygonOffsetFactor={-5} roughness={0.9} depthTest />
    </Decal>
  );
}

export function HoodieModel() {
  const color = useCustomizerStore((s) => s.color);
  const decals = useCustomizerStore((s) => s.decals);

  const { scene } = useGLTF(HOODIE_MODEL_PATH);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone) as unknown as HoodieGLTF;

  const colorTarget = useMemo(() => new THREE.Color(color.hex), [color.hex]);
  // Cloned so recoloring never mutates the shared/cached glTF material.
  const hoodieMaterial = useMemo(() => materials.Purple.clone(), [materials.Purple]);
  const anchors = useGarmentAnchors(nodes.Casual_Body_1?.geometry);

  useFrame((_, delta) => {
    hoodieMaterial.color.lerp(colorTarget, Math.min(1, delta * 6));
  });

  return (
    <group dispose={null} position={[0, -1.55, 0]}>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={100}>
        <primitive object={nodes.Root} />
      </group>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={100}>
        <skinnedMesh geometry={nodes.Casual_Feet_1.geometry} material={materials.White} skeleton={nodes.Casual_Feet_1.skeleton} />
        <skinnedMesh geometry={nodes.Casual_Feet_2.geometry} material={hoodieMaterial} skeleton={nodes.Casual_Feet_2.skeleton} />
      </group>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={100}>
        <skinnedMesh geometry={nodes.Casual_Legs_1.geometry} material={materials.Skin} skeleton={nodes.Casual_Legs_1.skeleton} />
        <skinnedMesh geometry={nodes.Casual_Legs_2.geometry} material={materials.LightBlue} skeleton={nodes.Casual_Legs_2.skeleton} />
      </group>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={100}>
        <skinnedMesh geometry={nodes.Casual_Head_1.geometry} material={materials.Skin} skeleton={nodes.Casual_Head_1.skeleton} />
        <skinnedMesh geometry={nodes.Casual_Head_2.geometry} material={materials.Eyebrows} skeleton={nodes.Casual_Head_2.skeleton} />
        <skinnedMesh geometry={nodes.Casual_Head_3.geometry} material={materials.Eye} skeleton={nodes.Casual_Head_3.skeleton} />
        <skinnedMesh geometry={nodes.Casual_Head_4.geometry} material={materials.Hair} skeleton={nodes.Casual_Head_4.skeleton} />
      </group>
      <group position={[0, 0.007, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={100}>
        {/* Purple = hoodie fabric: the only mesh that takes the active color + decals. */}
        <skinnedMesh geometry={nodes.Casual_Body_1.geometry} material={hoodieMaterial} skeleton={nodes.Casual_Body_1.skeleton}>
          {anchors && <FabricLiveDecal anchor={anchors.chest} />}
          {anchors && decals.map((decal) => <DecalMesh key={decal.id} decal={decal} anchors={anchors} />)}
        </skinnedMesh>
        <skinnedMesh geometry={nodes.Casual_Body_2.geometry} material={materials.Skin} skeleton={nodes.Casual_Body_2.skeleton} />
      </group>
    </group>
  );
}

useGLTF.preload(HOODIE_MODEL_PATH);

export default HoodieModel;
