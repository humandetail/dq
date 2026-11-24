import { mat4, quat, vec3 } from 'gl-matrix';
import { decodeBLP, getBLPImageData, ModelRenderer, parseMDX } from 'war3-model';
import { tower, type Battle } from './battle';

export function createScene(
  canvas: HTMLCanvasElement,
  select: (id: string | undefined) => void,
  animationLabel: (label: string) => void,
) {
  const context = canvas.getContext('webgl', { antialias: true });
  if (!context) throw new Error('浏览器无法建立 WebGL 场景');
  const gl = context;
  const camera = vec3.fromValues(7, -10, 8);
  const view = mat4.lookAt(mat4.create(), camera, [2.6, 0, 0.45], [0, 0, 1]);
  const projection = mat4.ortho(mat4.create(), -5.6, 5.6, -3.5, 3.5, 0.1, 40);
  const clip = mat4.multiply(mat4.create(), projection, view);
  const cameraWorld = mat4.invert(mat4.create(), view)!;
  const cameraRotation = mat4.getRotation(quat.create(), cameraWorld);
  const { box } = solidGeometry(gl, clip);
  let model: ModelRenderer | undefined;
  let showModel = false;
  let standSequence = 0;
  let attackSequence = 0;
  let attackDuration = 0;
  let attackUntil = 0;
  let modelScale = 1;
  let modelBase = 0;
  let lastTime = 0;
  let picks: { id: string; x: number; y: number; rx: number; ry: number }[] = [];

  function project(x: number, z: number) {
    const point = vec3.transformMat4(vec3.create(), [x, 0, z], clip);
    return [(point[0] + 1) * canvas.width / 2, (1 - point[1]) * canvas.height / 2];
  }

  canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
    const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    const hit = picks.find(point => ((x - point.x) / point.rx) ** 2 + ((y - point.y) / point.ry) ** 2 <= 1);
    select(hit?.id);
  });

  function idle() {
    attackUntil = 0;
    model?.setSequence(standSequence);
    animationLabel('待机');
  }

  return {
    async load(files: File[]) {
      const source = files.find(file => /\.mdx$/i.test(file.name));
      if (!source) throw new Error('请选择一个 MDX 文件和其 BLP 贴图');
      const parsed = parseMDX(await source.arrayBuffer());
      const textureFiles = new Map(files.map(file => [file.name.toLowerCase(), file]));
      const textures = await Promise.all(parsed.Textures.filter(texture => texture.Image).map(async texture => {
        const filename = texture.Image.split(/[\\/]/).at(-1)!;
        const file = textureFiles.get(filename.toLowerCase());
        if (!file) throw new Error(`缺少贴图 ${filename}`);
        const decoded = decodeBLP(await file.arrayBuffer());
        const image = getBLPImageData(decoded, 0);
        return { path: texture.Image, image: new ImageData(new Uint8ClampedArray(image.data), image.width, image.height) };
      }));
      const stand = parsed.Sequences.findIndex(sequence => /^stand$/i.test(sequence.Name));
      const attack = parsed.Sequences.findIndex(sequence => /^attack$/i.test(sequence.Name));
      if (stand < 0 || attack < 0) throw new Error('需要 Stand 和 Attack 动画');
      const nextModel = new ModelRenderer(parsed);
      nextModel.initGL(gl);
      nextModel.setCamera(camera, cameraRotation);
      nextModel.setTeamColor([0.22, 0.72, 0.89]);
      for (const texture of textures) nextModel.setTextureImageData(texture.path, [texture.image]);
      const extents = parsed.Geosets.reduce(([minimum, maximum], geoset) => [
        Math.min(minimum, geoset.MinimumExtent[2]), Math.max(maximum, geoset.MaximumExtent[2]),
      ], [Infinity, -Infinity]);
      modelBase = -extents[0];
      modelScale = 2.7 / Math.max(1, extents[1] - extents[0]);
      const range = parsed.Sequences[attack].Interval;
      attackDuration = range[1] - range[0];
      standSequence = stand;
      attackSequence = attack;
      model?.destroy();
      model = nextModel;
      showModel = true;
      idle();
      const glow = parsed.Textures.some(texture => texture.ReplaceableId === 2);
      return `已加载 ${source.name} · ${textures.length} 张贴图${glow ? ' · 队伍光晕' : ''}`;
    },

    swap() {
      showModel = !showModel;
      idle();
      return showModel;
    },

    idle,

    attack() {
      if (!model || !showModel) return;
      model.setSequence(attackSequence);
      attackUntil = performance.now() + attackDuration;
      animationLabel('攻击动画播放中');
    },

    draw(battle: Battle, selected: string | undefined, now: number) {
      const delta = Math.min(100, Math.max(0, now - lastTime));
      lastTime = now;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.075, 0.13, 0.16, 1);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      box(2.5, 0, -0.14, 8.2, 3.9, 0.2, [0.15, 0.27, 0.28]);
      box(2.5, 0, -0.025, 8.1, 0.47, 0.035, [0.29, 0.40, 0.38]);
      box(tower.x, 0, 0.01, 1.30, 1.30, 0.12, selected === tower.id ? [0.52, 0.92, 0.70] : [0.23, 0.53, 0.46]);
      for (const unit of battle.units) {
        box(unit.x, 0, 0.36, 0.62, 0.62, 0.74, selected === unit.id ? [0.97, 0.73, 0.40] : [0.80, 0.37, 0.22]);
        box(unit.x - 0.11, -0.314, 0.46, 0.09, 0.03, 0.09, [0.96, 0.83, 0.57]);
        box(unit.x + 0.11, -0.314, 0.46, 0.09, 0.03, 0.09, [0.96, 0.83, 0.57]);
      }
      if (model && showModel) {
        if (attackUntil && now >= attackUntil) idle();
        model.update(delta);
        const transform = mat4.translate(mat4.create(), view, [tower.x, 0, 0.075 + modelBase * modelScale]);
        mat4.scale(transform, transform, [modelScale, modelScale, modelScale]);
        model.render(transform, projection, {});
        canvas.dataset.sequence = model.getSequence() === attackSequence ? 'Attack' : 'Stand';
        canvas.dataset.animationFrame = String(model.getFrame());
      } else {
        box(tower.x, 0, 0.49, 0.73, 0.73, 0.95, [0.22, 0.63, 0.55]);
        box(tower.x, 0, 1.1, 0.94, 0.94, 0.32, [0.34, 0.75, 0.66]);
        canvas.dataset.sequence = 'geometry';
        delete canvas.dataset.animationFrame;
      }

      const height = showModel ? 2.7 : 1.3;
      const [x, y] = project(tower.x, height / 2);
      const [, foot] = project(tower.x, 0);
      picks = battle.units.map(unit => {
        const [unitX, unitY] = project(unit.x, 0.38);
        return { id: unit.id, x: unitX, y: unitY, rx: 30, ry: 36 };
      });
      picks.push({ id: tower.id, x, y, rx: showModel ? 73 : 47, ry: foot - y + 16 });
    },
  };
}

function solidGeometry(gl: WebGLRenderingContext, clip: mat4) {
  const program = gl.createProgram()!;
  const shaders: [number, string][] = [
    [gl.VERTEX_SHADER, 'attribute vec3 position; uniform mat4 matrix; varying float height; void main() { height = position.z; gl_Position = matrix * vec4(position, 1.0); }'],
    [gl.FRAGMENT_SHADER, 'precision mediump float; uniform vec3 color; varying float height; void main() { gl_FragColor = vec4(color * (0.84 + height * 0.29), 1.0); }'],
  ];
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? '着色器编译失败');
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '场景初始化失败');
  const corners = [
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5],
    [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5],
  ];
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(indices.flatMap(index => corners[index])), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  const matrix = gl.getUniformLocation(program, 'matrix');
  const tint = gl.getUniformLocation(program, 'color');
  const transform = mat4.create();

  function box(x: number, y: number, z: number, w: number, d: number, h: number, color: [number, number, number]) {
    mat4.translate(transform, clip, [x, y, z]);
    mat4.scale(transform, transform, [w, d, h]);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(matrix, false, transform);
    gl.uniform3fv(tint, color);
    gl.drawArrays(gl.TRIANGLES, 0, indices.length);
    gl.disableVertexAttribArray(position);
  }

  return { box };
}
