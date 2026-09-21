/**
 * BackgroundEffect.js - 新标签页背景的熔融金属光效控制器
 *
 * 移植自 React Bits 的 MoltenMetal（React + ogl）。原组件是 React 组件，
 * 本仓库没有 React 也没有构建步骤，因此只保留它的着色器与参数语义，
 * 用原生 WebGL2 重写渲染层：一个铺满视口的三角形 + 一个片元着色器 + rAF。
 * 没有引入 ogl，也没有新增运行时依赖。
 *
 * 浅色和深色各有一套配色，全部来自 variables.css 的 --background-effect-* 令牌：
 * - 深色：背景透明，光效以加色方式叠在页面背景上，只有丝线发亮。
 * - 浅色：着色器自己铺底再按覆盖率混色（原组件的 lightMode 路径），
 *   必须排在卡片下面，所以背景层用 z-index: -1。
 *
 * 性能与降级：
 * - 只渲染可见页面：IntersectionObserver + visibilitychange 暂停 rAF。
 * - prefers-reduced-motion: reduce 时只画一帧静态画面，不做动画。
 * - WebGL2 不可用或创建失败时整体放弃，页面保持原来的纯色背景。
 * - 投影上限 1.5，避免高分屏把 GPU 打满。
 *
 * 参数语义与 React Bits 版本一致：color1 阴影色、color2 中间色、color3 高光色、
 * speed 速度、scale 视野缩放、detail 折叠次数(1-8)、glow 光晕增益、
 * coreSize 丝线粗细、swirl 旋转量、fold 湍流强度、blackPoint 暗部下限、
 * brightness 亮度、grain/grainIntensity 颗粒、colorMode 调色板。
 */

const MAX_DPR = 1.5;

/** 与 React Bits 版本同名的调色板映射：molten=0 / ember=1 / frost=2 */
const COLOR_MODE_TO_FLOAT = { molten: 0, ember: 1, frost: 2 };

const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * 片元着色器：折叠域焦散（domain-folding caustics）。
 * 与 React Bits 的 MoltenMetal 逐行等价，只把 uniform 名改成小写、整型 uniform 换成 float，
 * 让原生 WebGL2 少踩 location/类型上的坑。
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uColorMode;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uOpacity;
uniform float uLightMode;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uBackgroundColor;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float time = uTime * uSpeed;
  vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y) - 0.5;

  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * uSwirl;

  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
  float glowCore = uGlow * uCoreSize;

  for (float n = 0.0; n < 8.0; n++) {
    if (n >= uDetail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }

  c /= 6.0;

  float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
  float g = clamp(intensity, 0.0, 1.0);

  float mid = 0.5;
  if (uColorMode > 1.5) {
    mid = 0.65;
  } else if (uColorMode > 0.5) {
    mid = 0.35;
  }

  vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
  col = mix(col, uColor3, smoothstep(mid, 1.0, g));

  if (uLightMode > 0.5) {
    // 浅色：先把焦散压成 0-1 的"信号"，再用它决定底色之上盖多少颜色。
    // 覆盖率上限 0.58、下限 0.02，让背景稳定亮过丝线，卡片和文字始终最清楚。
    float signal = 1.0 - exp(-max(c, 0.0) * 6.0);
    float body = smoothstep(0.09, 0.72, signal);
    float ridge = smoothstep(0.42, 0.92, signal);

    vec3 lightCol = mix(uColor1, uColor2, smoothstep(0.08, 0.52, signal));
    lightCol = mix(lightCol, uColor3, smoothstep(0.52, 0.96, signal));
    lightCol = mix(lightCol, lightCol * 0.72, ridge * 0.24);

    float coverage = body * mix(0.02, 0.58, signal) * uOpacity;
    if (uGrain > 0.5) {
      float gr = hash(gl_FragCoord.xy + uTime);
      coverage += (gr - 0.5) * uGrainIntensity * body * 0.16;
    }
    fragColor = vec4(mix(uBackgroundColor, lightCol, clamp(coverage, 0.0, 0.62)), 1.0);
  } else {
    // 深色：透明度就是亮度，只让丝线自己发亮，暗部保持全透明。
    float a = g;
    if (uGrain > 0.5) {
      float gr = hash(gl_FragCoord.xy + uTime);
      a += (gr - 0.5) * uGrainIntensity;
    }
    a = clamp(a, 0.0, 1.0) * uOpacity;
    fragColor = vec4(col * a, a);
  }
}
`;

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!match) return [1, 1, 1];
  return [
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255
  ];
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`背景光效着色器编译失败：${log}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`背景光效着色器链接失败：${log}`);
  }
  return program;
}

/** 收集所有 uniform / attribute location，省掉渲染循环里的字符串查找。 */
function collectLocations(gl, program) {
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return {
    uniforms,
    position: gl.getAttribLocation(program, 'position')
  };
}

class BackgroundEffect {
  /**
   * 默认参数对齐用户在特效站挑中的那一版，只把调色板交给主题令牌。
   */
  constructor({
    container,
    speed = 0.35,
    scale = 4,
    detail = 3,
    glow = 1.6,
    coreSize = 0.1,
    swirl = 1,
    fold = -0.2,
    blackPoint = 0.05,
    brightness = 1.3,
    colorMode = 'molten',
    grain = true,
    grainIntensity = 0.05,
    strength = 0.7,
    theme = 'light'
  } = {}) {
    this.container = container || null;
    this.speed = speed;
    this.scale = scale;
    this.detail = detail;
    this.glow = glow;
    this.coreSize = coreSize;
    this.swirl = swirl;
    this.fold = fold;
    this.blackPoint = blackPoint;
    this.brightness = brightness;
    this.colorMode = colorMode;
    this.grain = grain;
    this.grainIntensity = grainIntensity;
    this.strength = normalizeStrength(strength, 0.7);
    this.theme = theme === 'dark' ? 'dark' : 'light';

    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.uniforms = {};
    this.positionLocation = -1;
    this.vertexBuffer = null;
    this.colors = { background: '#ffffff', color1: '#e2e0d6', color2: '#8f8b7c', color3: '#ffffff' };

    this.raf = 0;
    this.staticMode = false;
    this.contextLost = false;
    this.timeOffset = 0;
    this.lastFrameTime = 0;
    this.lastVerticalOffset = -1;

    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.reducedMotionQuery = null;
    this.handleVisibilityChange = () => {};
    this.handleWindowResize = () => {};
    this.handleContextLost = () => {};
    this.handleContextRestored = () => {};

    this.supported = this.init();
    if (this.supported !== false) {
      this.setTheme(this.theme);
      this.setStrength(this.strength);
    }
  }

  /** 建上下文、编译着色器、挂观察者；失败时返回 false 让调用方安静降级。 */
  init() {
    const container = this.container;
    if (!container || typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'background-effect-canvas';
      canvas.setAttribute('aria-hidden', 'true');

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power'
      });
      if (!gl) {
        canvas.remove();
        return false;
      }

      this.canvas = canvas;
      this.gl = gl;

      this.createRenderResources();

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);

      this.uploadStaticUniforms();
      this.uploadColors();

      this.resize();
      container.appendChild(canvas);

      // ResizeObserver 在 Chrome 扩展里一定存在；resize 事件兜底覆盖窗口尺寸和方向变化
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(window.document.documentElement);
      this.handleWindowResize = () => this.resize();
      window.addEventListener('resize', this.handleWindowResize);

      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.handleReducedMotionChange = () => this.applyMotionPreference();
      this.reducedMotionQuery.addEventListener?.('change', this.handleReducedMotionChange);
      this.applyMotionPreference();

      this.intersectionObserver = new IntersectionObserver(
        ([entry]) => this.setPageVisible(Boolean(entry?.isIntersecting)),
        { threshold: 0 }
      );
      this.intersectionObserver.observe(canvas);

      this.handleVisibilityChange = () => this.setDocumentVisible(!document.hidden);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.setDocumentVisible(!document.hidden);

      this.handleContextLost = (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.stop();
      };
      this.handleContextRestored = () => {
        try {
          // WebGL 上下文恢复后，旧 program / buffer / location 都已作废；必须完整重建。
          this.createRenderResources();
          this.contextLost = false;
          this.uploadStaticUniforms();
          this.uploadColors();
          this.resize();
          this.start();
        } catch (error) {
          console.warn('[MarkPad] 背景光效上下文恢复失败，已退回纯色背景：', error);
          this.contextLost = true;
          this.stop();
        }
      };
      canvas.addEventListener('webglcontextlost', this.handleContextLost);
      canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

      return true;
    } catch (error) {
      console.warn('[MarkPad] 背景光效初始化失败，已退回纯色背景：', error);
      this.teardown();
      return false;
    }
  }

  /** 创建上下文专属资源；初始渲染和 webglcontextrestored 都必须调用。 */
  createRenderResources() {
    const gl = this.gl;
    if (!gl) throw new Error('WebGL2 上下文不可用');

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const locations = collectLocations(gl, program);
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) {
      gl.deleteProgram(program);
      throw new Error('背景光效顶点缓冲区创建失败');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.program = program;
    this.uniforms = locations.uniforms;
    this.positionLocation = locations.position;
    this.vertexBuffer = vertexBuffer;
  }

  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    this.colors = readThemeColors(this.theme);
    this.uploadColors();
    this.render();
  }

  /** strength 0-1：同时压暗丝线亮度，0 等于看不见。 */
  setStrength(strength) {
    this.strength = normalizeStrength(strength, this.strength);
    this.uploadStaticUniforms();
    this.render();
  }

  applyMotionPreference() {
    this.staticMode = Boolean(this.reducedMotionQuery?.matches);
    if (this.staticMode) {
      // 只保留一张静态画面：看不出动画，但背景质感还在
      this.stop();
      this.render();
      return;
    }
    if (this.pageVisible && this.documentVisible) this.start();
  }

  setPageVisible(visible) {
    this.pageVisible = Boolean(visible);
    if (this.pageVisible && this.documentVisible && !this.staticMode) this.start();
    else this.stop();
  }

  setDocumentVisible(visible) {
    this.documentVisible = Boolean(visible);
    if (this.pageVisible && this.documentVisible && !this.staticMode) this.start();
    else this.stop();
  }

  /** 强度 0-1 直接当增益用：0 = 完全看不出光效，1 = 默认亮度。 */
  getGlowGain() {
    return this.strength;
  }

  getOpacity() {
    return this.theme === 'dark' ? this.strength * 0.98 : 0.18 + this.strength * 0.82;
  }

  uploadStaticUniforms() {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.useProgram(this.program);
    const u = this.uniforms;
    if (u.uSpeed) gl.uniform1f(u.uSpeed, this.speed);
    if (u.uScale) gl.uniform1f(u.uScale, this.scale);
    if (u.uDetail) gl.uniform1f(u.uDetail, this.detail);
    if (u.uGlow) gl.uniform1f(u.uGlow, this.glow);
    if (u.uCoreSize) gl.uniform1f(u.uCoreSize, Math.max(this.coreSize, 0.001));
    if (u.uSwirl) gl.uniform1f(u.uSwirl, this.swirl);
    if (u.uFold) gl.uniform1f(u.uFold, this.fold);
    if (u.uBlackPoint) gl.uniform1f(u.uBlackPoint, this.blackPoint);
    if (u.uBrightness) gl.uniform1f(u.uBrightness, this.brightness);
    if (u.uColorMode) gl.uniform1f(u.uColorMode, COLOR_MODE_TO_FLOAT[this.colorMode] ?? 0);
    if (u.uGrain) gl.uniform1f(u.uGrain, this.grain ? 1 : 0);
    if (u.uGrainIntensity) gl.uniform1f(u.uGrainIntensity, this.grainIntensity);
    if (u.uLightMode) gl.uniform1f(u.uLightMode, this.theme === 'light' ? 1 : 0);
  }

  uploadColors() {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.useProgram(this.program);
    const u = this.uniforms;
    setVec3(gl, u.uColor1, hexToRgb(this.colors.color1));
    setVec3(gl, u.uColor2, hexToRgb(this.colors.color2));
    setVec3(gl, u.uColor3, hexToRgb(this.colors.color3));
    setVec3(gl, u.uBackgroundColor, hexToRgb(this.colors.background));
  }

  /** 视口尺寸按投影上限缩放，避免 2x/3x 屏用像素量换肉眼看不出的锐度。 */
  resize() {
    const gl = this.gl;
    const canvas = this.canvas;
    if (!gl || !canvas) return;

    const width = Math.max(1, window.innerWidth || 1);
    const height = Math.max(1, window.innerHeight || 1);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));

    const verticalOffset = window.scrollY || 0;
    if (pixelWidth === canvas.width && pixelHeight === canvas.height && verticalOffset === this.lastVerticalOffset) {
      return;
    }

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.lastVerticalOffset = verticalOffset;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    if (this.uniforms.uResolution) {
      gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.uResolution, pixelWidth, pixelHeight);
    }
    this.render();
  }

  /** 画一帧；时间用 performance.now() 累计，暂停恢复后动画进度不会跳变。 */
  render() {
    const gl = this.gl;
    if (!gl || !this.program || !this.canvas || this.contextLost) return;
    if (!this.canvas.width || !this.canvas.height) return;

    // 用 Date.now() 而不是 performance.now()：后者在无头浏览器的虚拟时间下不前进，
    // 会让"暂停恢复后不跳帧"的判断在自动化验证里失效；Date.now() 两边都走墙上时钟。
    const now = Date.now();
    if (this.lastFrameTime) this.timeOffset += (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (this.positionLocation >= 0) {
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    const gain = this.getGlowGain();
    if (this.uniforms.uGlow) gl.uniform1f(this.uniforms.uGlow, this.glow * gain);
    if (this.uniforms.uBrightness) gl.uniform1f(this.uniforms.uBrightness, this.brightness * (0.72 + 0.28 * gain));
    if (this.uniforms.uCoreSize) gl.uniform1f(this.uniforms.uCoreSize, Math.max(this.coreSize, 0.001) * (0.72 + 0.28 * gain));
    if (this.uniforms.uOpacity) gl.uniform1f(this.uniforms.uOpacity, this.getOpacity());
    if (this.uniforms.uTime) gl.uniform1f(this.uniforms.uTime, this.timeOffset);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  loop() {
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  start() {
    if (this.raf || this.staticMode || this.contextLost) return;
    if (!this.pageVisible || !this.documentVisible) return;
    // 参考帧从零开始，避免恢复播放时补一大段时间
    this.lastFrameTime = 0;
    this.raf = requestAnimationFrame(() => this.loop());
  }

  stop() {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** 页面切走、进入减少动效或组件销毁时释放；不会删除容器本身。 */
  teardown() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.reducedMotionQuery?.removeEventListener?.('change', this.handleReducedMotionChange);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resize', this.handleWindowResize);
    this.canvas?.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas?.removeEventListener('webglcontextrestored', this.handleContextRestored);
    if (this.gl && this.program) {
      this.gl.deleteBuffer(this.vertexBuffer);
      this.gl.deleteProgram(this.program);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.vertexBuffer = null;
  }

  destroy() {
    this.supported = false;
    this.teardown();
  }
}

function setVec3(gl, location, rgb) {
  if (!location) return;
  gl.uniform3f(location, rgb[0], rgb[1], rgb[2]);
}

/** 把外部传入的强度收敛到 0-1，非法值回落到 fallback。 */
function normalizeStrength(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

/** 从 CSS 令牌读配色：浅色和深色由 data-theme 决定，配色只维护在 variables.css。 */
export function readThemeColors(theme) {
  const fallback = theme === 'dark'
    ? { background: '#141414', color1: '#3a3f5c', color2: '#6366f1', color3: '#ffffff' }
    : { background: '#fafaf7', color1: '#e2e0d6', color2: '#8f8b7c', color3: '#ffffff' };

  if (typeof document === 'undefined') return fallback;

  const root = document.documentElement;
  const style = getComputedStyle(root);
  const read = (name, value) => {
    const token = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(token) ? token : value;
  };

  return {
    background: read('--background-effect-bg', fallback.background),
    color1: read('--background-effect-color1', fallback.color1),
    color2: read('--background-effect-color2', fallback.color2),
    color3: read('--background-effect-color3', fallback.color3)
  };
}

export default BackgroundEffect;
