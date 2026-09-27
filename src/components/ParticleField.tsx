"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const WORDS = [
  "React", "Marketing", "Data", "UX Design", "SEO", "Python",
  "Vente", "Finance", "Logistique", "Comptabilité", "Soins", "DevOps",
];

function makeWordTexture(word: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "600 30px 'Space Grotesk Variable', 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(226, 238, 255, 0.92)";
  ctx.fillText(word, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 2;
  return tex;
}

export default function ParticleField() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 860) return;

    let cancelled = false;
    let raf = 0;
    const disposables: { dispose(): void }[] = [];
    let cleanup: (() => void) | undefined;

    const start = () => {
      if (cancelled || !host.clientWidth) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        58,
        host.clientWidth / Math.max(host.clientHeight, 1),
        0.1,
        120
      );
      camera.position.set(0, 2.4, 26);

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);
      disposables.push(renderer);

      /* ── Galaxy of candidates ──────────────────────────── */
      const COUNT = 1300;
      const positions = new Float32Array(COUNT * 3);
      const colors = new Float32Array(COUNT * 3);
      const mint = new THREE.Color("#4fe3b2");
      const violet = new THREE.Color("#8f7bff");
      const c = new THREE.Color();

      for (let i = 0; i < COUNT; i++) {
        const r = 7 + Math.pow(Math.random(), 0.65) * 21;
        const a = Math.random() * Math.PI * 2;
        positions[i * 3] = Math.cos(a) * r;
        positions[i * 3 + 1] = (Math.random() - 0.5) * (2.6 + r * 0.16);
        positions[i * 3 + 2] = Math.sin(a) * r;
        c.copy(mint).lerp(violet, Math.min(r / 28, 1) * (0.35 + Math.random() * 0.65));
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.17,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      disposables.push(geo, mat);

      /* ── Floating keyword sprites ───────────────────────── */
      type Floater = {
        sprite: THREE.Sprite;
        baseX: number;
        baseY: number;
        baseZ: number;
        phase: number;
        speed: number;
        amp: number;
      };
      const floaters: Floater[] = [];

      WORDS.forEach((word, i) => {
        const tex = makeWordTexture(word);
        const smat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.38 - (i % 3) * 0.06,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(smat);
        const a = (i / WORDS.length) * Math.PI * 2 + 0.7;
        const r = 10.5 + (i % 4) * 3.6;
        const baseX = Math.cos(a) * r;
        const baseZ = Math.sin(a) * r * 0.85;
        const baseY = -3 + ((i * 5.3) % 9);
        sprite.scale.set(5.6, 1.4, 1);
        sprite.position.set(baseX, baseY, baseZ);
        scene.add(sprite);
        disposables.push(tex, smat);
        floaters.push({
          sprite,
          baseX,
          baseY,
          baseZ,
          phase: i * 1.31,
          speed: 0.45 + (i % 5) * 0.11,
          amp: 0.55 + (i % 3) * 0.25,
        });
      });

      /* ── Mouse parallax ─────────────────────────────────── */
      let mx = 0;
      let my = 0;
      const onMouse = (e: MouseEvent) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("mousemove", onMouse, { passive: true });

      /* ── Render only when visible ───────────────────────── */
      let running = true;
      const io = new IntersectionObserver(
        ([entry]) => {
          running = entry.isIntersecting;
        },
        { threshold: 0 }
      );
      io.observe(host);
      const onVis = () => {
        running = !document.hidden && running !== false ? !document.hidden : false;
        if (!document.hidden) running = true;
      };
      document.addEventListener("visibilitychange", onVis);

      const onResize = () => {
        camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(host.clientWidth, host.clientHeight);
      };
      window.addEventListener("resize", onResize);

      const clock = new THREE.Clock();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!running) return;
        const t = clock.getElapsedTime();

        points.rotation.y += 0.00048;

        for (const f of floaters) {
          f.sprite.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * f.amp;
          f.sprite.position.x = f.baseX + Math.cos(t * f.speed * 0.7 + f.phase) * f.amp * 0.6;
        }

        camera.position.x += (mx * 2.4 - camera.position.x) * 0.035;
        camera.position.y += (2.4 - my * 1.6 - camera.position.y) * 0.035;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        disposables.forEach((d) => d.dispose());
        renderer.domElement.remove();
      };
    };

    if ("fonts" in document && document.fonts?.ready) {
      document.fonts.ready.then(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      aria-hidden="true"
      style={{
        background:
          "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(79,227,178,0.07), transparent 65%), radial-gradient(ellipse 50% 40% at 78% 68%, rgba(143,123,255,0.08), transparent 70%)",
      }}
    />
  );
}
