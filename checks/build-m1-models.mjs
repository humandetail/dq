import { writeFile } from "node:fs/promises";
import { BoxGeometry, CylinderGeometry, DodecahedronGeometry, OctahedronGeometry, SphereGeometry } from "three";
import { generateMDX } from "war3-model";

const directory = new URL("../src/assets/m1/", import.meta.url);
const vector = (...values) => new Float32Array(values);
const extents = { MinimumExtent: vector(-1, -1, 0), MaximumExtent: vector(1, 1, 2), BoundsRadius: 2 };
const base = () => new CylinderGeometry(0.39, 0.55, 0.78, 6).translate(0, 0.47, 0);
const fin = (x, angle) => new OctahedronGeometry(0.20).scale(1.3, 0.22, 1.1)
  .rotateY(angle).translate(x, 0.22, -0.04);
const claw = (x, angle) => new OctahedronGeometry(0.17).scale(0.65, 0.55, 1.6)
  .rotateY(angle).translate(x, 0.16, 0.29);
const models = {
  beacon: {
    parts: [base(), new CylinderGeometry(0.33, 0.42, 0.45, 6).translate(0, 1.08, 0),
      new SphereGeometry(0.19, 8, 4).translate(0, 1.33, 0)],
    colors: [0xe6a346, 0xffdf8d], surface: [2, 0, 1], animatedFrom: 1, motion: [0, 0, 0.23],
  },
  prism: {
    parts: [base(), new CylinderGeometry(0.50, 0.37, 0.12, 6).translate(0, 0.85, 0),
      new OctahedronGeometry(0.39).scale(0.78, 1.15, 0.78).translate(0, 1.19, 0)],
    colors: [0x4a9ba2, 0xaafde9], surface: [2, 0, 1], animatedFrom: 2, motion: [0, 0, 0.23],
  },
  skimmer: {
    parts: [new OctahedronGeometry(0.35, 1).scale(0.65, 0.56, 1).translate(0, 0.21, 0),
      fin(-0.22, -0.35), fin(0.22, 0.35), new BoxGeometry(0.24, 0.08, 0.11).translate(0, 0.24, 0.27)],
    colors: [0xb94336, 0xf79667], surface: [0, 1, 1, 1], animatedFrom: 0, motion: [0, -0.24, 0.10],
  },
  shell: {
    parts: [new DodecahedronGeometry(0.43).scale(0.95, 0.73, 0.88).translate(0, 0.33, 0),
      new OctahedronGeometry(0.24).scale(0.65, 1.2, 1).translate(0, 0.48, -0.04),
      claw(-0.25, 0.25), claw(0.25, -0.25)],
    colors: [0x82458d, 0xe7a4e9], surface: [0, 1, 1, 1], animatedFrom: 0, motion: [0, -0.20, 0.12],
  },
};

function wcCoordinates(attribute) {
  const result = new Float32Array(attribute.array.length);
  for (let i = 0; i < attribute.count; i++) {
    result.set([attribute.getX(i), -attribute.getZ(i), attribute.getY(i)], i * 3);
  }
  return result;
}

function texture(colors) {
  const side = 32;
  const offset = 156 + 256 * 4;
  const blp = Buffer.alloc(offset + side ** 2);
  blp.write("BLP1");
  blp.writeUInt32LE(1, 4);
  blp.writeUInt32LE(side, 12);
  blp.writeUInt32LE(side, 16);
  blp.writeUInt32LE(offset, 28);
  blp.writeUInt32LE(side ** 2, 92);
  [...colors, 0x354d54, 0x668185].forEach((color, index) => blp.writeUInt32LE(color, 156 + index * 4));
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const localX = x % (side / 4);
      const accent = localX === 0 || y === 2 || y === side - 3 || y % 8 === 0;
      const color = Math.floor(x / (side / 4));
      blp[offset + y * side + x] = accent ? (color ^ 1) : color;
    }
  }
  return blp;
}

for (const [id, { parts, colors, surface, animatedFrom, motion }] of Object.entries(models)) {
  const bones = parts.map((_, index) => ({
    Name: `Part${index}`, ObjectId: index, PivotPoint: vector(0, 0, 0), Flags: 256,
    GeosetId: index, GeosetAnimId: -1,
    Translation: { LineType: 1, Keys: [0, 600, 1000, 1100, 1220].map(Frame => ({
      Frame, Vector: Frame === 1100 && index >= animatedFrom ? vector(...motion) : vector(0, 0, 0),
    })) },
  }));
  const model = {
    Version: 800, Info: { Name: id, BlendTime: 0, ...extents },
    Sequences: [["Stand", 0, 600], ["Attack", 1000, 1220]].map(([Name, start, end]) => ({
      Name, Interval: new Uint32Array([start, end]), NonLooping: Name === "Attack", MoveSpeed: 0, Rarity: 0, ...extents,
    })),
    Textures: [{ Image: `${id}.blp`, ReplaceableId: 0, Flags: 0 }],
    Materials: [{ Layers: [{ FilterMode: 0, Shading: 0, TextureID: 0, CoordId: 0, Alpha: 1 }] }],
    Geosets: parts.map((geometry, index) => {
      const { position, normal, uv } = geometry.attributes;
      const uvTile = new Float32Array(uv.array);
      for (let coordinate = 0; coordinate < uvTile.length; coordinate += 2) {
        uvTile[coordinate] = (surface[index] + 0.06 + uvTile[coordinate] * 0.88) / 4;
      }
      return {
        Vertices: wcCoordinates(position), Normals: wcCoordinates(normal),
        TVertices: [uvTile], Faces: new Uint16Array(geometry.index?.array ?? Array.from({ length: position.count }, (_, i) => i)),
        VertexGroup: new Uint8Array(position.count), Groups: [[index]], TotalGroupsCount: 1,
        MaterialID: 0, SelectionGroup: 0, Unselectable: false, Anims: [], ...extents,
      };
    }),
    Bones: bones, Nodes: bones, PivotPoints: bones.map(bone => bone.PivotPoint),
    GeosetAnims: [], Helpers: [], Attachments: [], EventObjects: [], CollisionShapes: [],
    GlobalSequences: [], ParticleEmitters: [], ParticleEmitters2: [], Cameras: [], Lights: [], RibbonEmitters: [], TextureAnims: [],
  };
  await writeFile(new URL(`${id}.mdx`, directory), Buffer.from(generateMDX(model)));
  await writeFile(new URL(`${id}.blp`, directory), texture(colors));
}
