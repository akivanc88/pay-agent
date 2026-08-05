/** Creates and sizes the lazy Three.js renderer with safe capability fallback. */

import type { CardTextureCanvases } from "./gift-card-3d-textures";

type ThreeApi = typeof import("three");
type RoomEnvironmentConstructor = typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;

const CARD_WIDTH = 1.586;
const CARD_HEIGHT = 1;

type RenderSetup = {
  THREE: ThreeApi;
  RoomEnvironment: RoomEnvironmentConstructor;
  canvas: HTMLCanvasElement;
  textures: CardTextureCanvases;
};

/** Construct the Three renderer, lighting rig, textured mesh, and owned GPU resources. */
export function createGiftCardRenderer({ THREE, RoomEnvironment, canvas, textures }: RenderSetup) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.74;

  const map = new THREE.CanvasTexture(textures.color);
  map.colorSpace = THREE.SRGBColorSpace;
  const ormMap = new THREE.CanvasTexture(textures.material);
  const bumpMap = new THREE.CanvasTexture(textures.height);
  for (const texture of [map, ormMap, bumpMap]) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.repeat.set(1 / CARD_WIDTH, 1 / CARD_HEIGHT);
    texture.offset.set(0.5, 0.5);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.set(0, 0, 4.4);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.3;
  room.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(0.6, 2.4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(2.6, -1.6, 1.4);
  scene.add(rim);

  const shape = roundedCardShape(THREE);
  const thickness = 0.045;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelOffset: 0,
    bevelSegments: 4,
    curveSegments: 32,
  });
  geometry.translate(0, 0, -thickness / 2);

  const faceMaterial = new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    bumpMap,
    bumpScale: 2.5,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.6,
  });
  faceMaterial.anisotropy = 0.5;
  faceMaterial.anisotropyRotation = Math.PI / 2;

  const edgeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(textures.palette["--card-gold"]),
    roughness: 0.3,
    metalness: 1,
    envMapIntensity: 1.3,
  });
  const pivot = new THREE.Group();
  pivot.add(new THREE.Mesh(geometry, [faceMaterial, edgeMaterial]));
  scene.add(pivot);

  return {
    renderer,
    scene,
    camera,
    pivot,
    resize(host: HTMLElement) {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const verticalFov = 2 * Math.atan(Math.tan((24 * Math.PI) / 360) * camera.aspect);
      camera.position.z = (CARD_WIDTH * 1.16) / 2 / Math.tan(verticalFov / 2);
      camera.updateProjectionMatrix();
    },
    dispose() {
      geometry.dispose();
      faceMaterial.dispose();
      edgeMaterial.dispose();
      map.dispose();
      ormMap.dispose();
      bumpMap.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}

function roundedCardShape(THREE: ThreeApi) {
  const shape = new THREE.Shape();
  const radius = 0.085;
  const x0 = -CARD_WIDTH / 2;
  const y0 = -CARD_HEIGHT / 2;
  const x1 = CARD_WIDTH / 2;
  const y1 = CARD_HEIGHT / 2;
  shape.moveTo(x0 + radius, y0);
  shape.lineTo(x1 - radius, y0);
  shape.absarc(x1 - radius, y0 + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(x1, y1 - radius);
  shape.absarc(x1 - radius, y1 - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(x0 + radius, y1);
  shape.absarc(x0 + radius, y1 - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(x0, y0 + radius);
  shape.absarc(x0 + radius, y0 + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}
