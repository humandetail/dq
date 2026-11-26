import * as THREE from "three";
import { decodeBLP, getBLPImageData, ModelRenderer, parseMDX } from "war3-model";
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
  renderer.setTeamColor([0.74, 0.45, 0.19]);
  for (const [name, image] of textures) renderer.setTextureImageData(name, [image]);
  const nativeUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const rotation = new THREE.Matrix4();
  const tilt = new THREE.Matrix4();
  const view = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const degrees = new THREE.Quaternion();
  const modelScale = "scale" in entry ? entry.scale : id === "H021" ? 0.014 : 0.007;
  const floor = "baseZ" in entry ? entry.baseZ * modelScale : 0;
  const modelSize = new THREE.Vector3(modelScale, modelScale, modelScale);

  return (camera: THREE.Camera, x: number, z: number, facing: number, elapsedMs: number, clip?: "Stand" | "Walk" | "Attack" | "Death" | "Spell", size = 1, lift = 0) => {
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
    eye.copy(camera.position).applyMatrix4(rotation.clone().invert());
    degrees.setFromRotationMatrix(camera.matrixWorld);
    renderer.setCamera([eye.x, eye.y, eye.z], [degrees.x, degrees.y, degrees.z, degrees.w]);
    if (renderer.getSequence() !== index) renderer.setSequence(index);
    renderer.setFrame(start + (clip === "Death" ? Math.min(Math.max(0, elapsedMs), end - start) :
      elapsedMs % Math.max(1, end - start)));
    renderer.update(0);
    renderer.render(view.elements as unknown as Matrix, camera.projectionMatrix.elements as unknown as Matrix, {});
    return { frame: renderer.getFrame(), substitute, progress };
  };
}
