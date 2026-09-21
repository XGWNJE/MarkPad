/**
 * CardEffects - 书签卡片光效控制器
 *
 * 视觉效果移植自 React Bits 的 MagicBento（原组件为 React + gsap），
 * 这里保留同样的视觉参数，改成在现有 DOM 上直接挂载：
 *   - 3D 倾斜 + 磁吸：hover 时按光标位置做小幅旋转与位移（gsap 驱动 transform）
 *
 * 所有光效都只画在卡片自身内部（卡片 overflow: hidden，没有全局聚光层），
 * 不会往卡片之间的背景上打光。
 *
 * 颜色一律不在这里写死，由 css/modules/variables.css 的 --card-glow-* 令牌控制；
 * 本模块只负责写 --glow-x / --glow-y / --glow-intensity / --glow-radius 和 transform。
 *
 * 触摸设备、窄屏（<=768px）和 prefers-reduced-motion 下自动停用，交给 card.css 的静态悬停反馈。
 */
import { gsap } from '../vendor/gsap.js';

const MOBILE_BREAKPOINT = 768;
const RECT_TTL = 500;

export const CARD_EFFECT_DEFAULTS = {
  enableStars: false,
  /** 已移除描边与卡面光照；保留字段仅让现有调用保持兼容。 */
  enableBorderGlow: false,
  enableTilt: true,
  enableMagnetism: true,
  clickEffect: false,
  disableAnimations: false,
  /** 覆盖光照半径（px），null 时用 --card-glow-radius 令牌 */
  glowRadius: null,
  particleCount: 12
};

const mediaQueryCache = new Map();

/** 缓存 MediaQueryList：每张卡片挂载都会查询环境，避免重复构造 */
function mediaQuery(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!mediaQueryCache.has(query)) {
    mediaQueryCache.set(query, window.matchMedia(query));
  }
  return mediaQueryCache.get(query);
}

function createParticle(width, height) {
  const el = document.createElement('div');
  el.className = 'card-particle';
  el.style.left = `${Math.random() * width}px`;
  el.style.top = `${Math.random() * height}px`;
  return el;
}

/** 单张卡片上的光效：粒子、倾斜、磁吸、涟漪 */
class CardEffect {
  constructor(system, element) {
    this.system = system;
    this.element = element;
    this.particles = [];
    this.timeouts = [];
    this.pool = [];
    this.poolReady = false;
    this.hovered = false;
    this.attached = false;

    this.handlePointerEnter = this.handlePointerEnter.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.releaseTransform = this.releaseTransform.bind(this);
  }

  get options() {
    return this.system.options;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;

    const el = this.element;
    if (this.options.enableBorderGlow) el.classList.add('card-effect-active');

    el.addEventListener('pointerenter', this.handlePointerEnter);
    el.addEventListener('pointerleave', this.handlePointerLeave);
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('click', this.handleClick);
    el.addEventListener('dragstart', this.releaseTransform);
  }

  destroy() {
    if (!this.attached) return;
    this.attached = false;

    const el = this.element;
    el.removeEventListener('pointerenter', this.handlePointerEnter);
    el.removeEventListener('pointerleave', this.handlePointerLeave);
    el.removeEventListener('pointermove', this.handlePointerMove);
    el.removeEventListener('click', this.handleClick);
    el.removeEventListener('dragstart', this.releaseTransform);
    el.classList.remove('card-effect-active');

    this.hovered = false;
    this.clearParticles();
    this.releaseTransform();
  }

  /** 系统整体开关变化时把卡片恢复到静止状态 */
  onEnabledChange(enabled) {
    if (enabled) return;
    this.hovered = false;
    this.clearParticles();
    this.releaseTransform();
  }

  /**
   * 清掉 gsap 写在卡片上的 transform。
   * 拖拽、网格 FLIP 排序会自己写 inline transform，两边必须交接干净，
   * 否则 gsap 的 transform 缓存会和外部写入的值对不上，出现跳动。
   */
  releaseTransform() {
    if (!this.element) return;
    gsap.killTweensOf(this.element);
    gsap.set(this.element, { clearProps: 'transform' });
  }

  // ---------- 交互 ----------

  handlePointerEnter(event) {
    if (event.pointerType === 'touch' || !this.system.enabled) return;
    this.hovered = true;

    if (this.options.enableStars) this.spawnParticles();

    if (this.options.enableTilt) {
      gsap.to(this.element, {
        scale: 1.02,
        rotateX: 5,
        rotateY: 5,
        duration: 0.3,
        ease: 'power2.out',
        transformPerspective: 1000,
        overwrite: 'auto'
      });
    }
  }

  handlePointerLeave() {
    this.hovered = false;
    if (this.options.enableStars) this.clearParticles();

    const { enableTilt, enableMagnetism } = this.options;
    if (!enableTilt && !enableMagnetism) return;

    const vars = { duration: 0.3, ease: 'power2.out', overwrite: 'auto', clearProps: 'transform' };
    if (enableTilt) {
      vars.rotateX = 0;
      vars.rotateY = 0;
      vars.scale = 1;
    }
    if (enableMagnetism) {
      vars.x = 0;
      vars.y = 0;
    }
    gsap.to(this.element, vars);
  }

  handlePointerMove(event) {
    if (event.pointerType === 'touch' || !this.system.enabled) return;

    const { enableTilt, enableMagnetism } = this.options;
    if (!enableTilt && !enableMagnetism) return;

    const el = this.element;
    const rect = el.getBoundingClientRect();
    // 卡片被倾斜后 getBoundingClientRect 是外接矩形，尺寸用 offsetWidth/Height 更稳
    const width = el.offsetWidth || rect.width;
    const height = el.offsetHeight || rect.height;
    if (!width || !height) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const centerX = width / 2;
    const centerY = height / 2;

    if (enableTilt) {
      gsap.to(el, {
        rotateX: ((y - centerY) / centerY) * -10,
        rotateY: ((x - centerX) / centerX) * 10,
        duration: 0.1,
        ease: 'power2.out',
        transformPerspective: 1000,
        overwrite: 'auto'
      });
    }

    if (enableMagnetism) {
      gsap.to(el, {
        x: (x - centerX) * 0.05,
        y: (y - centerY) * 0.05,
        duration: 0.3,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    }
  }

  handleClick(event) {
    if (!this.options.clickEffect || !this.system.enabled) return;

    const el = this.element;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const maxDistance = Math.max(
      Math.hypot(x, y),
      Math.hypot(x - rect.width, y),
      Math.hypot(x, y - rect.height),
      Math.hypot(x - rect.width, y - rect.height)
    );

    const ripple = document.createElement('div');
    ripple.className = 'card-ripple';
    ripple.style.width = `${maxDistance * 2}px`;
    ripple.style.height = `${maxDistance * 2}px`;
    ripple.style.left = `${x - maxDistance}px`;
    ripple.style.top = `${y - maxDistance}px`;
    el.appendChild(ripple);

    // gsap 的 onComplete 负责正常收尾；这里再兜一个定时器，
    // 避免 tween 被外部 kill（拖拽、卡片重渲染）时涟漪节点留在 DOM 里。
    window.setTimeout(() => ripple.remove(), 1200);

    gsap.fromTo(
      ripple,
      { scale: 0, opacity: 1 },
      { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() }
    );
  }

  // ---------- 粒子 ----------

  initializeParticles() {
    if (this.poolReady || !this.element) return;
    const { width, height } = this.element.getBoundingClientRect();
    this.pool = Array.from({ length: this.options.particleCount }, () =>
      createParticle(width, height)
    );
    this.poolReady = true;
  }

  spawnParticles() {
    if (!this.element) return;
    if (!this.poolReady) this.initializeParticles();

    this.pool.forEach((particle, index) => {
      const timeoutId = window.setTimeout(() => {
        if (!this.hovered || !this.element || !this.element.isConnected) return;

        const clone = particle.cloneNode(true);
        this.element.appendChild(clone);
        this.particles.push(clone);

        gsap.fromTo(
          clone,
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' }
        );

        gsap.to(clone, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: 'none',
          repeat: -1,
          yoyo: true
        });

        gsap.to(clone, {
          opacity: 0.3,
          duration: 1.5,
          ease: 'power2.inOut',
          repeat: -1,
          yoyo: true
        });
      }, index * 100);

      this.timeouts.push(timeoutId);
    });
  }

  clearParticles() {
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.timeouts = [];

    this.particles.forEach((particle) => {
      gsap.to(particle, {
        scale: 0,
        opacity: 0,
        duration: 0.3,
        ease: 'back.in(1.7)',
        onComplete: () => particle.remove()
      });
    });
    this.particles = [];
  }
}

/** 全局控制器：统一跟光标，计算每张卡片的光照强度（光只画在卡片内部） */
class CardEffectSystem {
  constructor() {
    this.options = { ...CARD_EFFECT_DEFAULTS };
    this.effects = new Map();
    this.enabled = false;
    this.tracking = false;
    this.grid = null;
    this.rects = new Map();
    this.glowState = new WeakMap();
    this.rectsDirty = true;
    this.rectStamp = 0;
    this.pointer = null;
    this.frame = 0;
    this.tokens = { radius: 300, fillPeak: 0.1 };

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleDocumentLeave = this.handleDocumentLeave.bind(this);
    this.handleLayoutChange = this.handleLayoutChange.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);

    // 主题切换只改 <html data-theme>，光照峰值要跟着重新读取（光晕颜色由 CSS 令牌自己跟随）
    this.themeObserver = new MutationObserver(() => this.readTokens());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  /** 覆盖默认参数；可重复调用 */
  configure(options = {}) {
    Object.assign(this.options, options);
    this.readTokens();
    this.refreshEnabled();
  }

  /** 把卡片挂进光效系统，返回该卡片的效果句柄 */
  attach(element, options = {}) {
    if (!element) return null;

    let effect = this.effects.get(element);
    if (!effect) {
      effect = new CardEffect(this, element);
      this.effects.set(element, effect);
    }
    if (Object.keys(options).length) Object.assign(this.options, options);
    effect.attach();

    this.rectsDirty = true;
    this.refreshEnabled();
    return effect;
  }

  detach(element) {
    const effect = this.effects.get(element);
    if (!effect) return;
    effect.destroy();
    this.effects.delete(element);
    this.rects.delete(element);
  }

  /** 按当前环境决定是否启用光效（触摸、窄屏、减少动效时关闭） */
  refreshEnabled() {
    const disabled =
      this.options.disableAnimations ||
      Boolean(mediaQuery('(hover: none)')?.matches) ||
      Boolean(mediaQuery('(prefers-reduced-motion: reduce)')?.matches) ||
      window.innerWidth <= MOBILE_BREAKPOINT;
    const next = !disabled;

    const shouldTrackGlow = next && this.options.enableBorderGlow;
    if (shouldTrackGlow && !this.tracking) this.startTracking();
    if (!shouldTrackGlow && this.tracking) this.stopTracking();
    if (next === this.enabled) return;

    this.enabled = next;
    this.effects.forEach((effect) => effect.onEnabledChange(next));
  }

  // ---------- 全局追踪 ----------

  startTracking() {
    if (this.tracking) return;
    this.tracking = true;
    this.readTokens();

    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('mouseleave', this.handleDocumentLeave);
    window.addEventListener('scroll', this.handleLayoutChange, { passive: true, capture: true });
    window.addEventListener('resize', this.handleViewportChange, { passive: true });

    this.rectsDirty = true;
  }

  stopTracking() {
    if (!this.tracking) return;
    this.tracking = false;

    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('mouseleave', this.handleDocumentLeave);
    window.removeEventListener('scroll', this.handleLayoutChange, { capture: true });
    window.removeEventListener('resize', this.handleViewportChange);

    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.pointer = null;
    this.resetGlow();
  }

  readTokens() {
    if (typeof window === 'undefined' || !document.documentElement) return;
    const styles = getComputedStyle(document.documentElement);
    const radius = Number.parseFloat(styles.getPropertyValue('--card-glow-radius'));
    const fillPeak = Number.parseFloat(styles.getPropertyValue('--card-spotlight-peak'));
    this.tokens.radius = Number.isFinite(radius) ? radius : 300;
    this.tokens.fillPeak = Number.isFinite(fillPeak) ? fillPeak : 0.1;
  }

  handlePointerMove(event) {
    if (event.pointerType === 'touch') return;
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  handleDocumentLeave() {
    this.resetGlow();
  }

  handleLayoutChange() {
    this.rectsDirty = true;
  }

  handleViewportChange() {
    this.rectsDirty = true;
    this.refreshEnabled();
  }

  getGrid() {
    if (!this.grid || !this.grid.isConnected) {
      this.grid = document.querySelector('.bookmark-grid');
    }
    return this.grid;
  }

  /** 收集仍在 DOM 上的卡片；已经离场的顺手注销，避免网格重渲染后残留引用 */
  collectCards(grid) {
    const alive = [];
    this.effects.forEach((effect, card) => {
      if (!card.isConnected || !grid.contains(card)) {
        this.detach(card);
        return;
      }
      alive.push(card);
    });
    return alive;
  }

  update() {
    if (!this.pointer || !this.enabled) return;

    const grid = this.getGrid();
    if (!grid) return;

    const cards = this.collectCards(grid);
    if (!cards.length) return;

    const now = performance.now();
    if (this.rectsDirty || now - this.rectStamp > RECT_TTL) {
      this.rects.clear();
      cards.forEach((card) => this.rects.set(card, card.getBoundingClientRect()));
      this.rectStamp = now;
      this.rectsDirty = false;
    }

    const { x, y } = this.pointer;
    const radius = this.options.glowRadius || this.tokens.radius;

    // 指针必须真的落在某张卡片上才有光照，卡片之间的空隙和网格外都不打光
    let overAnyCard = false;
    cards.forEach((card) => {
      if (this.rects.has(card) && pointInRect(x, y, this.rects.get(card))) overAnyCard = true;
    });

    if (!overAnyCard) {
      this.resetGlow();
      return;
    }

    const withBorderGlow = this.options.enableBorderGlow;
    // 卡片外围的柔化距离：越靠近光标越亮，最亮处封顶 0.6，避免出现"一圈硬光"
    const fadeDistance = glowFadeDistance(radius);

    cards.forEach((card) => {
      const rect = this.rects.get(card);
      if (!rect || !rect.width || !rect.height) return;

      const distanceToEdge = distanceToRectEdge(x, y, rect);
      const intensity = glowIntensity(distanceToEdge, fadeDistance);
      if (withBorderGlow) this.applyGlow(card, rect, x, y, intensity, radius);
    });
  }

  applyGlow(card, rect, pointerX, pointerY, intensity, radius) {
    const state = this.glowState.get(card) || { intensity: -1 };
    if (intensity === 0 && state.intensity === 0) return;

    const { width, height } = this.elementSize(card, rect);
    card.style.setProperty('--glow-x', `${(clampPercent((pointerX - rect.left) / width) * 100).toFixed(1)}%`);
    card.style.setProperty('--glow-y', `${(clampPercent((pointerY - rect.top) / height) * 100).toFixed(1)}%`);
    card.style.setProperty('--glow-radius', `${radius}px`);

    if (state.intensity !== intensity) {
      card.style.setProperty('--glow-intensity', intensity.toFixed(3));
      state.intensity = intensity;
      this.glowState.set(card, state);
    }
  }

  /**
   * 卡片倾斜后 getBoundingClientRect 是外接矩形，尺寸用 offsetWidth/Height 更稳，
   * 否则光斑位置会随着倾斜角度漂移。
   */
  elementSize(card, rect) {
    return {
      width: card.offsetWidth || rect.width,
      height: card.offsetHeight || rect.height
    };
  }

  /** 指针不在任何卡片上时把光照收回 0；没有全局层需要淡出 */
  resetGlow() {
    if (!this.options.enableBorderGlow) return;

    this.effects.forEach((effect, card) => {
      const state = this.glowState.get(card);
      if (state && state.intensity === 0) return;
      card.style.setProperty('--glow-intensity', '0');
      if (state) state.intensity = 0;
    });
  }
}

/** 点是否落在矩形内（触控目标小，不做额外容差） */
function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** 光斑位置换算成百分比时收在 0-1，卡片倾斜时不会把光斑推到卡片外 */
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** 光标到矩形最近边的距离，矩形内部为 0 */
export function distanceToRectEdge(x, y, rect) {
  return Math.max(
    0,
    Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2)) -
      Math.max(rect.width, rect.height) / 2
  );
}

/** 卡片外围的柔化距离：至少 80px，避免小卡片之外突然变亮 */
export function glowFadeDistance(radius) {
  const value = Number(radius);
  const safe = Number.isFinite(value) && value > 0 ? value : 300;
  return Math.max(safe * 0.3, 80);
}

/**
 * 光照强度曲线：0 在卡片边缘附近，1 在卡片中心。
 * 压到 0.6-1 之间：边缘不会突然点亮，中心也不会一路顶到满。
 * 超出柔化距离直接归零，所以只有指针附近的卡片会亮。
 */
export function glowIntensity(distanceToEdge, fadeDistance) {
  if (!Number.isFinite(distanceToEdge) || distanceToEdge >= fadeDistance) return 0;
  const falloff = 1 - Math.max(0, distanceToEdge) / fadeDistance;
  return 0.6 + 0.4 * falloff * falloff;
}

const CardEffects = new CardEffectSystem();

export default CardEffects;
