import * as THREE from "three";
import { decodeBLP, getBLPImageData, parseMDX } from "war3-model";
import { enemies, towers, type EnemyType, type TowerType } from "./game/content.ts";

type ModelId = TowerType | EnemyType;
const ids = [...Object.keys(towers), ...Object.keys(enemies)] as ModelId[];
// MDX is also Vite's Markdown module extension. Inline these small binary assets.
const assets = import.meta.glob<string>("./assets/m1/*.{mdx,blp}", {
  eager: true,
  query: "?inline&url",
  import: "default",
});

async function readAsset(url: string, id: ModelId) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材加载失败：${id}`);
  return response.arrayBuffer();
}

function positions(values: Float32Array) {
  const result = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 3) {
    result.set([values[index], values[index + 2], -values[index + 1]], index);
  }
  return result;
}

export async function loadModel(id: ModelId) {
  const [modelData, textureData] = await Promise.all([
    readAsset(assets[`./assets/m1/${id}.mdx`], id),
    readAsset(assets[`./assets/m1/${id}.blp`], id),
  ]);
  const model = parseMDX(modelData);
  const pixels = getBLPImageData(decodeBLP(textureData), 0);
  const texture = new THREE.DataTexture(new Uint8Array(pixels.data), pixels.width, pixels.height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.76 });
  const template = new THREE.Group();
  for (const geoset of model.Geosets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions(geoset.Vertices), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(positions(geoset.Normals), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(geoset.TVertices[0], 2));
    geometry.setIndex(new THREE.BufferAttribute(geoset.Faces, 1));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = model.Bones[geoset.Groups[0][0]].Name;
    template.add(mesh);
  }
  const attack = model.Sequences.find(sequence => sequence.Name === "Attack")!;
  const [start, end] = attack.Interval;
  const tracks = model.Bones.flatMap(bone => {
    const keys = bone.Translation?.Keys.filter(key => key.Frame >= start && key.Frame <= end);
    if (!keys?.length) return [];
    return [new THREE.VectorKeyframeTrack(
      `${bone.Name}.position`,
      keys.map(key => (key.Frame - start) / 1000),
      positions(new Float32Array(keys.flatMap(key => Array.from(key.Vector)))),
    )];
  });
  const clip = new THREE.AnimationClip(attack.Name, (end - start) / 1000, tracks);
  return () => {
    const body = template.clone();
    const mixer = new THREE.AnimationMixer(body);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    let attackStarted: number | undefined;
    return {
      body,
      attack(now: number) {
        action.reset().play();
        mixer.setTime(0);
        attackStarted = now;
      },
      draw(now: number) {
        if (attackStarted === undefined) return false;
        const elapsed = Math.max(0, (now - attackStarted) / 1000);
        mixer.setTime(Math.min(elapsed, clip.duration));
        if (elapsed >= clip.duration) attackStarted = undefined;
        return true;
      },
    };
  };
}

export async function loadM1Models() {
  const factories = await Promise.all(ids.map(async id => [id, await loadModel(id)] as const));
  return new Map(factories);
}

export type UnitModel = ReturnType<Awaited<ReturnType<typeof loadModel>>>;
