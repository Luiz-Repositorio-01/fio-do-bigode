"use client";

import { useEffect, useRef } from "react";

/**
 * Barber pole 3D em pé, "pregado" na página: tubo de vidro com listras helicoidais
 * renderizadas em canvas (projeção cilíndrica real + iluminação e reflexo), tampas de latão
 * e chapas de fixação com parafusos. Gira continuamente; respeita prefers-reduced-motion,
 * pausa fora da tela e com a aba oculta. Decorativo (aria-hidden).
 *
 * Preenche a altura do elemento pai (use `self-stretch` em grid/flex).
 */

type RGB = [number, number, number];
// cores clássicas: creme, vermelho, creme, azul
const BANDS: RGB[] = [
  [244, 236, 218],
  [190, 44, 40],
  [244, 236, 218],
  [34, 68, 116],
];
const BAND_COUNT = BANDS.length;
const CYCLES_PER_SECOND = 0.28; // velocidade da rotação
const FRAME_MS = 1000 / 32;

const brass =
  "bg-[linear-gradient(90deg,#5a4016_0%,#b8862f_20%,#f3d98f_42%,#d8a949_58%,#8a6a2b_82%,#4b3512_100%)]";

function Screw() {
  return (
    <span
      aria-hidden
      className="relative block h-[5px] w-[5px] lg:h-[7px] lg:w-[7px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#f6e2a6,#a67a2a_60%,#4b3512)] shadow-[0_1px_1px_rgba(0,0,0,.7)]"
    >
      <span className="absolute left-1/2 top-1/2 h-px w-[4px] lg:w-[5px] -translate-x-1/2 -translate-y-1/2 rotate-[35deg] bg-[#2a1d09]" />
    </span>
  );
}

function Plate({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 z-0 flex h-[11px] w-[176%] lg:h-[15px] lg:w-[168%] -translate-x-1/2 items-center justify-between rounded-[3px] border border-black/40 bg-[linear-gradient(180deg,#8a6a2b,#5a4016)] px-[2px] shadow-[0_2px_3px_rgba(0,0,0,.6)] ${className}`}
    >
      <Screw />
      <Screw />
    </span>
  );
}

export function BarberPole({ className = "" }: { className?: string }) {
  const tubeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tube = tubeRef.current;
    const canvas = canvasRef.current;
    if (!tube || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let theta: Float32Array;
    let shade: Float32Array;
    let spec: Float32Array;
    let alpha: Float32Array;
    let img: ImageData | null = null;
    let raf = 0;
    let visible = true;
    let last = 0;
    let start = performance.now();
    let pausedAt = 0;

    function prepare() {
      const rect = tube!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(8, Math.round(rect.width * dpr));
      H = Math.max(8, Math.round(rect.height * dpr));
      canvas!.width = W;
      canvas!.height = H;
      img = ctx!.createImageData(W, H);
      theta = new Float32Array(W);
      shade = new Float32Array(W);
      spec = new Float32Array(W);
      alpha = new Float32Array(W);
      const R = W / 2;
      // luz vinda de cima-esquerda; V = (0,0,1)
      const L: [number, number] = [-0.55, 0.835];
      const hx = L[0];
      const hz = L[1] + 1;
      const hn = Math.hypot(hx, hz);
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - R) / R;
        const au = Math.abs(u);
        alpha[x] = Math.min(1, Math.max(0, (1 - au) * R));
        if (au >= 1) continue;
        const th = Math.asin(u);
        theta[x] = th;
        const nz = Math.cos(th);
        const nx = u;
        const diffuse = Math.max(0, nx * L[0] + nz * L[1]);
        const rim = 0.55 + 0.45 * Math.pow(nz, 0.6);
        shade[x] = (0.3 + 0.8 * diffuse) * rim;
        const nh = Math.max(0, (nx * hx + nz * hz) / hn);
        spec[x] =
          Math.pow(nh, 70) * 0.85 +
          0.16 * Math.exp(-Math.pow((u - 0.74) / 0.07, 2)) + // reflexo fraco do lado oposto
          0.1 * Math.exp(-Math.pow((u + 0.2) / 0.28, 2)); // brilho largo do vidro
      }
    }

    function frame(now: number) {
      if (!img) return;
      const t = ((reduce ? 0 : now - start) / 1000) * CYCLES_PER_SECOND;
      const R = W / 2;
      const P = 4 * R; // período vertical (px) => listras a ~45° no centro
      const edge = 1.3 / (P / BAND_COUNT);
      const data = img.data;
      for (let y = 0; y < H; y++) {
        const base = y / P - t;
        let o = y * W * 4;
        for (let x = 0; x < W; x++, o += 4) {
          const a = alpha[x];
          if (a <= 0) {
            data[o + 3] = 0;
            continue;
          }
          let s = base + theta[x] / (2 * Math.PI);
          s -= Math.floor(s);
          const q = s * BAND_COUNT;
          const k = Math.floor(q);
          const f = q - k;
          let c = BANDS[k];
          if (f < edge) {
            const m = 0.5 + (0.5 * f) / edge;
            const p = BANDS[(k + BAND_COUNT - 1) % BAND_COUNT];
            c = [p[0] + (c[0] - p[0]) * m, p[1] + (c[1] - p[1]) * m, p[2] + (c[2] - p[2]) * m];
          } else if (f > 1 - edge) {
            const m = 0.5 + (0.5 * (1 - f)) / edge;
            const n = BANDS[(k + 1) % BAND_COUNT];
            c = [n[0] + (c[0] - n[0]) * m, n[1] + (c[1] - n[1]) * m, n[2] + (c[2] - n[2]) * m];
          }
          const sh = shade[x];
          const sp = spec[x] * 255;
          data[o] = Math.min(255, c[0] * sh + sp);
          data[o + 1] = Math.min(255, c[1] * sh + sp);
          data[o + 2] = Math.min(255, c[2] * sh + sp);
          data[o + 3] = a * 255;
        }
      }
      ctx!.putImageData(img, 0, 0);
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      frame(now);
    }

    function play() {
      if (reduce || raf) return;
      if (pausedAt) {
        start += performance.now() - pausedAt; // continua de onde parou
        pausedAt = 0;
      }
      raf = requestAnimationFrame(loop);
    }
    function pause() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      pausedAt = performance.now();
    }
    function sync() {
      if (visible && !document.hidden) play();
      else pause();
    }

    prepare();
    frame(performance.now());
    sync();

    const ro = new ResizeObserver(() => {
      prepare();
      frame(performance.now());
    });
    ro.observe(tube);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(tube);
    document.addEventListener("visibilitychange", sync);

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`relative mx-auto flex h-full min-h-[160px] w-full flex-col items-center drop-shadow-[4px_6px_6px_rgba(0,0,0,.5)] lg:drop-shadow-[7px_9px_9px_rgba(0,0,0,.55)] ${className}`}
    >
      {/* fixação superior */}
      <div className="relative z-10 flex w-full flex-col items-center">
        <span className="block h-[6px] w-[6px] rounded-full lg:h-[9px] lg:w-[9px] bg-[radial-gradient(circle_at_35%_30%,#fbeab5,#b8862f_55%,#4b3512)]" />
        <div className="relative flex w-full items-center justify-center">
          <Plate className="top-1" />
          <span className={`relative z-10 block h-[12px] w-[130%] rounded-t-[8px] lg:h-[18px] lg:w-[124%] lg:rounded-t-[12px] border-x border-t border-black/40 ${brass}`} />
        </div>
        <span className={`block h-[4px] w-[114%] lg:h-[6px] lg:w-[112%] border-x border-black/40 ${brass} brightness-90`} />
      </div>

      {/* tubo de vidro com listras em rotação */}
      <div ref={tubeRef} className="relative z-[5] w-full flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* fixação inferior */}
      <div className="relative z-10 flex w-full flex-col items-center">
        <span className={`block h-[4px] w-[114%] lg:h-[6px] lg:w-[112%] border-x border-black/40 ${brass} brightness-90`} />
        <div className="relative flex w-full items-center justify-center">
          <Plate className="bottom-1" />
          <span className={`relative z-10 block h-[14px] w-[130%] rounded-b-[9px] lg:h-[22px] lg:w-[124%] lg:rounded-b-[14px] border-x border-b border-black/40 ${brass}`} />
        </div>
        <span className="block h-[6px] w-[6px] rounded-b-full lg:h-[9px] lg:w-[9px] bg-[radial-gradient(circle_at_35%_30%,#fbeab5,#b8862f_55%,#4b3512)]" />
      </div>
    </div>
  );
}
