import * as THREE from "three";
import { decodeBLP, getBLPImageData, model as mdx, ModelRenderer, parseMDX } from "war3-model";
import manifest from "./assets/m2/models.json" with { type: "json" };

export type ModelId = keyof typeof manifest;
type Matrix = Parameters<ModelRenderer["render"]>[0];
// Vite's development transform returns JavaScript at the raw MDX/BLP URL.
const assets = import.meta.env.DEV
  ? import.meta.glob<string>("./assets/m2/*/*.{mdx,blp}", { query: "?inline&url", import: "default" })
  : import.meta.glob<string>("./assets/m2/*/*.{mdx,blp}", { query: "?url", import: "default" });

async function read(id: ModelId, file: string) {
  const url = assets[`./assets/m2/${id}/${file}`];
  if (!url) throw new Error(`M2 未登记素材：${id}/${file}`);
  const response = await fetch(await url());
  if (!response.ok) throw new Error(`M2 素材读取失败：${id}/${file}`);
  return response.arrayBuffer();
}

export async function loadM2Model(id: ModelId, gl: WebGL2RenderingContext | WebGLRenderingContext) {
  const entry = manifest[id];
  const [model, textures] = await Promise.all([
    read(id, "model.mdx").then(parseMDX),
    Promise.all(Object.entries(entry.textures).map(async ([name, { file }]) => {
      const blp = decodeBLP(await read(id, file));
      const pixels = getBLPImageData(blp, 0);
      return [name, new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)] as const;
    })),
  ]);
  for (const texture of model.Textures) {
    if (!texture.Image && (texture.ReplaceableId === 1 || texture.ReplaceableId === 2)) continue;
    if (!Object.hasOwn(entry.textures, texture.Image)) throw new Error(`M2 缺少贴图：${id}/${texture.Image}`);
  }

  const clips = new Map([...new Set(["Stand", "Walk", "Attack", "Death", "Spell", entry.loop])].map(name => {
    const exact = model.Sequences.findIndex(clip => clip.Name.trim().toLowerCase() === name.toLowerCase());
    const index = exact >= 0 ? exact : model.Sequences.findIndex(clip => clip.Name.trim().toLowerCase().startsWith(name.toLowerCase()));
    if (index < 0 && name !== "Spell" && !("staticStructure" in entry) && !("static" in entry) && !(name === "Walk" && "noWalk" in entry)) throw new Error(`M2 缺少动画：${id}/${name}`);
    return [name, index];
  }));
  const spellSlam = model.Sequences.findIndex(sequence => /^attack slam\b/i.test(sequence.Name.trim()));
  const renderer = new ModelRenderer(model);
  renderer.initGL(gl);
  const copper: [number, number, number] = [.74, .45, .19];
  const crimson: [number, number, number] = [.95, .08, .06];
  const blue: [number, number, number] = [.15, .3, .8];
  const stone: [number, number, number] = [96 / 255, 96 / 255, 96 / 255];
  let tint = copper;
  renderer.setTeamColor(copper);
  for (const [name, image] of textures) renderer.setTextureImageData(name, [image]);
  const nativeUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const rotation = new THREE.Matrix4();
  const tilt = new THREE.Matrix4();
  const view = new THREE.Matrix4();
  const cameraPosition: [number, number, number] = [0, 0, 0];
  const cameraRotation: [number, number, number, number] = [0, 0, 0, 1];
  const modelScale = "scale" in entry ? entry.scale : id === "H021" ? 0.014 : 0.007;
  const floor = "baseZ" in entry ? entry.baseZ * modelScale : 0;
  const modelSize = new THREE.Vector3(modelScale, modelScale, modelScale);
  const opaqueMaterials = model.Materials;
  let translucentMaterials: typeof model.Materials | undefined;

  return (camera: THREE.Camera, x: number, z: number, facing: number, elapsedMs: number, clip?: "Stand" | "Walk" | "Attack" | "Death" | "Spell", size = 1, lift = 0, color?: "red" | "blue" | "stone", translucent = false) => {
    const requested = clips.get(clip ?? entry.loop)!;
    const index = requested >= 0 ? requested : clip === "Spell" && spellSlam >= 0 ? spellSlam : clips.get(entry.loop)!;
    const [start, end] = model.Sequences[index].Interval;
    const substitute = requested < 0 && (clip === "Spell" ||
      "staticStructure" in entry && (clip === "Attack" || clip === "Death")) ? clip : undefined;
    const progress = substitute ? THREE.MathUtils.clamp(elapsedMs / (substitute === "Death" ? 720 : substitute === "Attack" ? 500 : 450), 0, 1) : undefined;
    const recoil = substitute === "Attack" ? Math.sin(progress! * Math.PI) : 0;
    const casting = substitute === "Spell" && spellSlam < 0 ? Math.sin(progress! * Math.PI) : 0;
    const height = substitute === "Death" ? Math.max(.03, 1 - progress!) : 1 + casting * .12;
    modelSize.setScalar(modelScale * size);
    modelSize.z *= height;
    rotation.makeRotationY(facing).multiply(tilt.makeRotationX(recoil * .14)).multiply(nativeUp)
      .scale(modelSize).setPosition(x, lift + .035 - floor * size * height, z);
    view.multiplyMatrices(camera.matrixWorldInverse, rotation);
    const matrix = rotation.elements;
    const dx = camera.position.x - matrix[12];
    const dy = camera.position.y - matrix[13];
    const dz = camera.position.z - matrix[14];
    // Orthogonal model axes permit the inverse transform by projecting
    // the camera vector onto each scaled axis.
    cameraPosition[0] = (matrix[0] * dx + matrix[1] * dy + matrix[2] * dz) / (modelSize.x ** 2);
    cameraPosition[1] = (matrix[4] * dx + matrix[5] * dy + matrix[6] * dz) / (modelSize.y ** 2);
    cameraPosition[2] = (matrix[8] * dx + matrix[9] * dy + matrix[10] * dz) / (modelSize.z ** 2);
    cameraRotation[0] = camera.quaternion.x;
    cameraRotation[1] = camera.quaternion.y;
    cameraRotation[2] = camera.quaternion.z;
    cameraRotation[3] = camera.quaternion.w;
    renderer.setCamera(cameraPosition, cameraRotation);
    const nextTint = color === "red" ? crimson : color === "blue" ? blue : color === "stone" ? stone : copper;
    if (nextTint !== tint) {
      tint = nextTint;
      renderer.setTeamColor(tint);
    }
    if (translucent && !translucentMaterials) {
      translucentMaterials = opaqueMaterials.map(material => ({ ...material, Layers: material.Layers.map(layer => {
        const alpha = layer.Alpha ?? 1;
        return { ...layer,
          Shading: (layer.Shading ?? 0) | mdx.LayerShading.NoDepthSet,
          FilterMode: (layer.FilterMode ?? 0) <= mdx.FilterMode.Transparent ? mdx.FilterMode.Blend : layer.FilterMode,
          Alpha: typeof alpha === "number" ? alpha * .5 : { ...alpha, Keys: alpha.Keys.map(key => ({ ...key,
            Vector: Float32Array.from(key.Vector, value => value * .5),
            InTan: key.InTan && Float32Array.from(key.InTan, value => value * .5),
            OutTan: key.OutTan && Float32Array.from(key.OutTan, value => value * .5),
          })) },
        };
      }) }));
    }
    model.Materials = translucent ? translucentMaterials! : opaqueMaterials;
    const frame = start + (clip === "Death" ? Math.min(Math.max(0, elapsedMs), end - start) :
      elapsedMs % Math.max(1, end - start));
    if (renderer.getSequence() !== index) renderer.setSequence(index);
    renderer.setFrame(frame);
    renderer.update(0);
    renderer.render(view.elements as unknown as Matrix, camera.projectionMatrix.elements as unknown as Matrix, {});
    return { frame: renderer.getFrame(), substitute, progress };
  };
}
