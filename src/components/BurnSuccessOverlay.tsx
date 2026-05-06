/**
 * BurnSuccessOverlay — full-screen confetti + celebration shown after a
 * successful burn. Renders a canvas with falling flame/skull particles and
 * a centered "🔥 X NFTs Destroyed" message. Auto-dismisses after 3.2 s.
 */

import { useEffect, useRef, useCallback } from "react";
import { Flame } from "lucide-react";

interface Props {
  count: number;
  onDone: () => void;
}

// ── Particle helpers ──────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  emoji: string;
  opacity: number;
  gravity: number;
}

const EMOJIS  = ["🔥", "💀", "🔥", "🔥", "✨", "🔥", "💀"];
const COLORS  = [
  "hsl(14 100% 55%)",
  "hsl(30 100% 60%)",
  "hsl(50 100% 60%)",
  "hsl(14 100% 40%)",
  "hsl(0 85% 55%)",
  "hsl(35 100% 65%)",
];

function makeParticle(canvasW: number): Particle {
  return {
    x:             Math.random() * canvasW,
    y:             -20 - Math.random() * 80,
    vx:            (Math.random() - 0.5) * 4,
    vy:            2 + Math.random() * 4,
    size:          14 + Math.random() * 18,
    rotation:      Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 6,
    color:         COLORS[Math.floor(Math.random() * COLORS.length)],
    emoji:         EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    opacity:       0.85 + Math.random() * 0.15,
    gravity:       0.08 + Math.random() * 0.06,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const BurnSuccessOverlay = ({ count, onDone }: Props) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const particles   = useRef<Particle[]>([]);
  const spawnedRef  = useRef(0);
  const startTime   = useRef(Date.now());

  const TOTAL_PARTICLES = Math.min(80 + count * 4, 160);
  const SPAWN_DURATION  = 1200; // ms over which particles spawn
  const LIFE_MS         = 3200; // total display time

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const elapsed = Date.now() - startTime.current;

    // Spawn particles gradually
    const targetCount = Math.floor((Math.min(elapsed, SPAWN_DURATION) / SPAWN_DURATION) * TOTAL_PARTICLES);
    while (spawnedRef.current < targetCount) {
      particles.current.push(makeParticle(canvas.width));
      spawnedRef.current++;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    particles.current.forEach((p) => {
      // Physics
      p.vy        += p.gravity;
      p.x         += p.vx;
      p.y         += p.vy;
      p.rotation  += p.rotationSpeed;

      // Fade out in final 800 ms
      const fadeStart = LIFE_MS - 800;
      if (elapsed > fadeStart) {
        p.opacity = Math.max(0, p.opacity - 0.018);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    });

    // Remove off-screen particles
    particles.current = particles.current.filter((p) => p.y < canvas.height + 60);

    if (elapsed < LIFE_MS) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      onDone();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  // Resize canvas to viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Start animation
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Canvas — full-screen confetti */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Center card */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl border border-primary/30 bg-background/80 backdrop-blur-xl shadow-[0_0_80px_hsl(var(--primary)/0.3)] animate-burn-pop"
          style={{ pointerEvents: "none" }}
        >
          {/* Flame icon */}
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Flame className="w-7 h-7 text-primary fire-glow" />
          </div>

          {/* Count */}
          <div className="text-center">
            <p className="text-4xl font-black tabular-nums text-primary fire-glow leading-none">
              {count.toLocaleString()}
            </p>
            <p className="text-sm font-bold uppercase tracking-widest text-foreground/60 mt-1">
              NFT{count !== 1 ? "s" : ""} permanently destroyed
            </p>
          </div>

          {/* Sub-line */}
          <p className="text-[11px] text-muted-foreground/50 font-mono">
            gone forever &mdash; just how we like it
          </p>
        </div>
      </div>
    </div>
  );
};
