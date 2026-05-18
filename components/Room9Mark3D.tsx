"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const path = new THREE.Shape();
  const right = x + width;
  const top = y + height;

  path.moveTo(x + radius, y);
  path.lineTo(right - radius, y);
  path.quadraticCurveTo(right, y, right, y + radius);
  path.lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top);
  path.lineTo(x + radius, top);
  path.quadraticCurveTo(x, top, x, top - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);

  return path;
}

function createNoiseTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.fillStyle = "#111";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 3600; index += 1) {
    const value = 22 + Math.floor(Math.random() * 72);
    context.fillStyle = `rgb(${value},${value},${value})`;
    context.globalAlpha = Math.random() * 0.42;
    context.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1 + Math.random() * 3,
      1 + Math.random() * 3
    );
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  return texture;
}

function createRShape() {
  const shape = new THREE.Shape();

  shape.moveTo(-1.9, -1.35);
  shape.lineTo(-1.36, -1.35);
  shape.lineTo(-1.36, -0.25);
  shape.lineTo(-0.98, -0.25);
  shape.lineTo(-0.38, -1.35);
  shape.lineTo(0.28, -1.35);
  shape.lineTo(-0.38, -0.08);
  shape.quadraticCurveTo(0.18, 0.12, 0.18, 0.7);
  shape.quadraticCurveTo(0.18, 1.35, -0.48, 1.35);
  shape.lineTo(-1.9, 1.35);
  shape.lineTo(-1.9, -1.35);

  const inner = new THREE.Path();
  inner.moveTo(-1.36, 0.28);
  inner.lineTo(-0.72, 0.28);
  inner.quadraticCurveTo(-0.34, 0.28, -0.34, 0.68);
  inner.quadraticCurveTo(-0.34, 0.98, -0.72, 0.98);
  inner.lineTo(-1.36, 0.98);
  inner.lineTo(-1.36, 0.28);
  shape.holes.push(inner);

  return shape;
}

function createNineBowlShape() {
  const outer = roundedRectPath(0.12, -0.18, 1.62, 1.52, 0.34);
  const inner = roundedRectPath(0.56, 0.27, 0.72, 0.58, 0.16);
  outer.holes.push(inner);
  return outer;
}

function createNineTailShape() {
  const shape = new THREE.Shape();

  shape.moveTo(1.18, 1.12);
  shape.lineTo(1.74, 1.12);
  shape.lineTo(1.74, -0.86);
  shape.quadraticCurveTo(1.74, -1.36, 1.22, -1.36);
  shape.lineTo(0.38, -1.36);
  shape.lineTo(0.22, -0.86);
  shape.lineTo(1.18, -0.86);
  shape.lineTo(1.18, -0.18);
  shape.lineTo(0.62, -0.18);
  shape.lineTo(0.62, 0.26);
  shape.lineTo(1.18, 0.26);
  shape.lineTo(1.18, 1.12);

  return shape;
}

function createLogoMesh(material: THREE.Material) {
  const group = new THREE.Group();
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.42,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.045,
    bevelThickness: 0.055,
    curveSegments: 12
  };

  const geometry = new THREE.ExtrudeGeometry(
    [createRShape(), createNineBowlShape(), createNineTailShape()],
    extrudeSettings
  );
  geometry.center();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  group.scale.setScalar(1.24);
  return group;
}

export function Room9Mark3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.08, 8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    mount.appendChild(renderer.domElement);

    const noiseTexture = createNoiseTexture();
    const material = new THREE.MeshStandardMaterial({
      color: 0x202020,
      emissive: 0x020202,
      metalness: 0.82,
      roughness: 0.66,
      bumpMap: noiseTexture ?? undefined,
      bumpScale: 0.08,
      map: noiseTexture ?? undefined
    });

    const logo = createLogoMesh(material);
    logo.rotation.x = -0.1;
    logo.rotation.y = -0.42;
    logo.rotation.z = -0.02;
    scene.add(logo);

    const frontLight = new THREE.DirectionalLight(0xffffff, 2.4);
    frontLight.position.set(-2.6, 3.2, 4.2);
    scene.add(frontLight);

    const rimLight = new THREE.DirectionalLight(0x9a9a9a, 1.25);
    rimLight.position.set(3.5, -1.2, 3.5);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId = 0;

    const animate = () => {
      if (!prefersReducedMotion) {
        logo.rotation.y += 0.0042;
        logo.rotation.x = -0.12 + Math.sin(Date.now() * 0.0007) * 0.045;
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frameId);
      renderer.dispose();
      logo.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });
      material.dispose();
      noiseTexture?.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 opacity-70 mix-blend-screen"
      ref={mountRef}
    />
  );
}
