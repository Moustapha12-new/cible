"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Constellation hero — poussière d'encre + nœuds émeraude flottant
 * sur une vague lente, avec parallaxe pointeur. Léger et pausable.
 */
export default function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmall = window.matchMedia("(max-width: 760px)").matches;
    const DUST_COUNT = isSmall ? 420 : 850;
    const NODE_COUNT = isSmall ? 46 : 90;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      host.clientWidth / host.clientHeight,
      0.1,
      100
    );
    camera.position.z = 26;

    /* Texture ronde douce pour des particules sans carrés */
    const makeDot = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    };
    const dotTex = makeDot();

    const group = new THREE.Group();
    scene.add(group);

    /* ── Poussière d'encre ── */
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(DUST_COUNT * 3);
    const baseY = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      const x = (Math.random() - 0.5) * 56;
      const y = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 22 - 4;
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;
      baseY[i] = y;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: new THREE.Color("#17150f"),
      size: 0.085,
      map: dotTex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    group.add(dust);

    /* ── Nœuds émeraude ── */
    const nodeGeo = new THREE.BufferGeometry();
    const nodePos = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      nodePos[i * 3] = (Math.random() - 0.5) * 50;
      nodePos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      nodePos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
    }
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: new THREE.Color("#0b6b4f"),
      size: 0.42,
      map: dotTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const nodes = new THREE.Points(nodeGeo, nodeMat);
    group.add(nodes);

    /* ── Interaction & boucle ── */
    let mouseX = 0;
    let mouseY = 0;
    const onPointer = (e: PointerEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let inView = true;
    let running = true;
    const syncRunning = () => {
      running = inView && !document.hidden;
    };
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncRunning();
    });
    io.observe(host);
    document.addEventListener("visibilitychange", syncRunning);

    const pos = dustGeo.attributes.position as THREE.BufferAttribute;
    const clock = new THREE.Clock();
    let raf = 0;
    let t = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running || document.hidden) return;
      t += clock.getDelta();

      const arr = pos.array as Float32Array;
      for (let i = 0; i < DUST_COUNT; i++) {
        const x = arr[i * 3];
        arr[i * 3 + 1] =
          baseY[i] +
          Math.sin(x * 0.32 + t * 0.6) * 0.75 +
          Math.cos(t * 0.35 + i * 0.02) * 0.28;
      }
      pos.needsUpdate = true;

      nodes.rotation.y = t * 0.03;

      group.rotation.y += (mouseX * 0.06 - group.rotation.y) * 0.04;
      group.rotation.x += (mouseY * 0.035 - group.rotation.x) * 0.04;

      renderer.render(scene, camera);

      if (reduced) {
        cancelAnimationFrame(raf); // rendu statique unique
      }
    };
    frame();

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      io.disconnect();
      document.removeEventListener("visibilitychange", syncRunning);
      dustGeo.dispose();
      nodeGeo.dispose();
      dustMat.dispose();
      nodeMat.dispose();
      dotTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}
