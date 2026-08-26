---
name: three-js-webgl
description: Three.js and WebGL patterns for 3D scenes, model loading (GLB/STL/OBJ), camera controls, lighting, materials, raycasting, and ONNX model inference in the browser. Use when building or modifying the 3D viewer, model pipeline, or WebGL rendering in React + Vite projects.
origin: custom
---

# Three.js + WebGL Patterns

3D scene setup, model loading, interaction, and browser-based ML inference for your viewer.

## When to Activate

- Building or modifying the 3D viewer
- Loading and displaying 3D models (STL, GLB, OBJ)
- Implementing camera controls, raycasting, or picking
- Running ONNX models in the browser
- Optimizing render performance or geometry
- Setting up lighting rigs or materials
- Exporting/generating meshes for download or printing

## Scene Setup (React)

```tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function Viewer({ modelUrl }: { modelUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    scene.add(dir);

    // Render loop
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
```

## Loading Models

### STL

```typescript
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const loader = new STLLoader();
loader.load(url, (geometry) => {
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 })
  );
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox!.getCenter(center);
  mesh.position.sub(center);
  scene.add(mesh);
});
```

### GLB / GLTF

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.load(url, ({ scene: model }) => {
  scene.add(model);
});
```

## Camera Fit to Model

```typescript
function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  controls: OrbitControls
) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;

  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}
```

## Raycasting (Click / Hover Picking)

```typescript
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length > 0) {
    console.log('Hit:', hits[0].object.name, hits[0].point);
  }
});
```

## Materials

```typescript
// Standard PBR
const mat = new THREE.MeshStandardMaterial({
  color: 0xfafafa,
  roughness: 0.5,
  metalness: 0.0,
});

// Wireframe overlay
const wire = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
```

## ONNX Inference in the Browser

```typescript
import * as ort from 'onnxruntime-web';

let session: ort.InferenceSession | null = null;

async function loadModel(modelPath: string) {
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

async function runInference(inputData: Float32Array, inputShape: number[]) {
  if (!session) throw new Error('Model not loaded');
  const tensor = new ort.Tensor('float32', inputData, inputShape);
  const feeds = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  return results[session.outputNames[0]].data as Float32Array;
}
```

## Geometry Export (for 3D Printing)

```typescript
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

function downloadSTL(mesh: THREE.Mesh, filename = 'model.stl') {
  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary: true }) as DataView;
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

## Performance Tips

- Use `BufferGeometry` exclusively (legacy `Geometry` removed in r125+)
- Dispose geometry, material, and textures when removing objects: `geo.dispose(); mat.dispose()`
- Merge static geometries with `BufferGeometryUtils.mergeGeometries()`
- Set `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — never go above 2
- Use `renderer.info` in dev to monitor draw calls and triangle count
- Shadow map: prefer `PCFSoftShadowMap`, constrain `shadowMap.width` to 1024 or 2048
