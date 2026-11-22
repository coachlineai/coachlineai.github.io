import {WebGLRenderer, PerspectiveCamera, Scene, HemisphereLight, DirectionalLight, Box3, Vector3, GLTFLoader} from './vendor/avatar-three.js';

let modelPromise;
function loadModel() {
  modelPromise ??= new GLTFLoader().loadAsync(new URL('./assets/matthias-avatar.glb', import.meta.url).href)
    .catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}

export async function mountAvatar(portrait) {
  const model = await loadModel();
  if (!portrait.isConnected) return;
  const renderer = new WebGLRenderer({antialias:true});
  // A script-disabled preview iframe paints canvas fallback content.
  const preview = portrait.ownerDocument !== document;
  const surface = preview ? portrait.ownerDocument.createElement('img') : renderer.domElement;
  surface.className = 'avatar-surface';
  if (preview) surface.alt = 'Interactive 3D avatar of Matthias';
  const scene = new Scene();
  const mesh = model.scene.clone(true);
  const bounds = new Box3().setFromObject(mesh);
  const center = bounds.getCenter(new Vector3());
  mesh.position.sub(center);
  scene.add(mesh, new HemisphereLight(0xfff5e9, 0xaab8cf, 2));
  const key = new DirectionalLight(0xffeedc, 2.4);
  key.position.set(-2,3,4);
  scene.add(key);
  const camera = new PerspectiveCamera(32,1,.01,100);
  const size = bounds.getSize(new Vector3());
  renderer.setClearColor(0x232326);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const draw = () => {
    const width = portrait.clientWidth, height = portrait.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.position.z = Math.max(size.y, size.x / camera.aspect) * 2.03;
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    if (preview) surface.src = renderer.domElement.toDataURL('image/webp', .88);
  };
  surface.tabIndex = 0;
  surface.setAttribute('aria-label','Matthias’s 3D avatar. Drag or use the left and right arrow keys to rotate.');
  surface.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    mesh.rotation.y += event.key === 'ArrowLeft' ? -.15 : .15;
    draw();
  };
  let lastX;
  surface.onpointerdown = event => {lastX = event.clientX; surface.setPointerCapture(event.pointerId);};
  surface.onpointermove = event => {
    if (!surface.hasPointerCapture(event.pointerId)) return;
    mesh.rotation.y += (event.clientX - lastX) * .012;
    lastX = event.clientX;
    draw();
  };
  draw();
  portrait.append(surface);
  const observer = new ResizeObserver(draw);
  observer.observe(portrait);
  portrait.disposeAvatar = () => {observer.disconnect(); renderer.dispose(); renderer.forceContextLoss();};
}
