import { defineConfig, type Plugin } from "vite";

function batchWarcraftBoneMatrices(): Plugin {
  const upload = "for (let j = 0; j < MAX_NODES; ++j) if (this.rendererData.nodes[j]) this.gl.uniformMatrix4fv(this.shaderProgramLocations.nodesMatricesAttributes[j], false, this.rendererData.nodes[j].matrix);";
  return {
    name: "batch-warcraft-bone-matrices",
    enforce: "pre",
    transform(source, id) {
      if (!id.endsWith("/war3-model/dist/es/war3-model.mjs")) return;
      if (!source.includes(upload)) this.error("war3-model changed its hardware skinning upload");
      return source.replace(upload, `
        const firstMatrix = this.shaderProgramLocations.nodesMatricesAttributes[0];
        if (isWebGL2(this.gl) && firstMatrix !== null) {
          if (!this.packedBoneMatrices) {
            const entries = [];
            for (let j = 0; j < MAX_NODES; ++j) {
              const node = this.rendererData.nodes[j];
              if (node) entries.push({ offset: j * 16, node });
            }
            const length = entries.length ? entries[entries.length - 1].offset + 16 : 0;
            this.packedBoneMatrices = { entries, packed: new Float32Array(length) };
          }
          const { entries, packed } = this.packedBoneMatrices;
          for (const { offset, node } of entries) packed.set(node.matrix, offset);
          if (packed.length) this.gl.uniformMatrix4fv(firstMatrix, false, packed);
        } else {
          ${upload}
        }
      `);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [batchWarcraftBoneMatrices()],
  optimizeDeps: { exclude: ["war3-model"] },
  assetsInclude: ["**/*.mdx", "**/*.blp"],
  build: {
    rollupOptions: { input: ["index.html", "m2.html"] },
  },
});
