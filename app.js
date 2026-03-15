const video = document.getElementById("camera");
const statusEl = document.getElementById("status");
const radiusSlider = document.getElementById("radiusSlider");
const radiusValueEl = document.getElementById("radiusValue");
const resetBtn = document.getElementById("resetBtn");

let scene;
let camera;
let renderer;

let workspace;
let robotBase;
let targetPoint;
let lineToTarget;

let workspaceRadius = parseFloat(radiusSlider.value);
let basePlaced = false;

const FIXED_DEPTH = -1.6;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const placementPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -FIXED_DEPTH);

init();

async function init() {
  initThree();
  createObjects();
  bindUI();
  await startCamera();
  onResize();
  animate();
  updateStatus("Tap once to place the robot base.");
}

function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  document.getElementById("app").appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
}

function createObjects() {
  const workspaceGeometry = new THREE.SphereGeometry(workspaceRadius, 48, 48);
  const workspaceMaterial = new THREE.MeshBasicMaterial({
    color: 0xfaad14,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  workspace = new THREE.Mesh(workspaceGeometry, workspaceMaterial);
  workspace.visible = false;
  scene.add(workspace);

  const workspaceWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(workspaceRadius, 24, 16)),
    new THREE.LineBasicMaterial({
      color: 0xfaad14,
      transparent: true,
      opacity: 0.65,
    })
  );
  workspace.add(workspaceWire);

  const baseGeometry = new THREE.SphereGeometry(0.05, 24, 24);
  const baseMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d4f });
  robotBase = new THREE.Mesh(baseGeometry, baseMaterial);
  robotBase.visible = false;
  scene.add(robotBase);

  const targetGeometry = new THREE.SphereGeometry(0.045, 24, 24);
  const targetMaterial = new THREE.MeshBasicMaterial({ color: 0x40a9ff });
  targetPoint = new THREE.Mesh(targetGeometry, targetMaterial);
  targetPoint.visible = false;
  scene.add(targetPoint);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
  });
  lineToTarget = new THREE.Line(lineGeometry, lineMaterial);
  lineToTarget.visible = false;
  scene.add(lineToTarget);
}

function bindUI() {
  updateRadiusLabel();

  radiusSlider.addEventListener("input", () => {
    workspaceRadius = parseFloat(radiusSlider.value);
    updateRadiusLabel();
    rebuildWorkspaceGeometry();

    if (basePlaced && targetPoint.visible) {
      evaluateReachability();
    }
  });

  resetBtn.addEventListener("click", resetScene);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateStatus("Camera API is not supported in this browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();
  } catch (error) {
    console.error(error);
    updateStatus("Failed to access camera. Please allow camera permission.");
  }
}

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  const point = screenToWorld(event.clientX, event.clientY);
  if (!point) return;

  if (!basePlaced) {
    placeRobotBase(point);
    return;
  }

  placeTarget(point);
}

function screenToWorld(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const intersection = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(placementPlane, intersection);

  return hit ? intersection.clone() : null;
}

function placeRobotBase(position) {
  robotBase.position.copy(position);
  robotBase.visible = true;

  workspace.position.copy(position);
  workspace.visible = true;

  basePlaced = true;

  updateStatus("Robot base placed. Tap again to place a target.");
}

function placeTarget(position) {
  targetPoint.position.copy(position);
  targetPoint.visible = true;

  updateConnectionLine();
  evaluateReachability();
}

function evaluateReachability() {
  const dist = robotBase.position.distanceTo(targetPoint.position);
  const reachable = dist <= workspaceRadius;

  if (reachable) {
    targetPoint.material.color.set(0x52c41a);
    lineToTarget.material.color.set(0x52c41a);
    updateStatus(
      `Target reachable. Distance: ${dist.toFixed(2)} m / Radius: ${workspaceRadius.toFixed(2)} m`
    );
  } else {
    targetPoint.material.color.set(0x40a9ff);
    lineToTarget.material.color.set(0xff7875);
    updateStatus(
      `Target outside workspace. Distance: ${dist.toFixed(2)} m / Radius: ${workspaceRadius.toFixed(2)} m`
    );
  }
}

function updateConnectionLine() {
  const points = [robotBase.position.clone(), targetPoint.position.clone()];
  lineToTarget.geometry.setFromPoints(points);
  lineToTarget.visible = true;
}

function rebuildWorkspaceGeometry() {
  const newSphere = new THREE.SphereGeometry(workspaceRadius, 48, 48);
  workspace.geometry.dispose();
  workspace.geometry = newSphere;

  const oldWire = workspace.children[0];
  if (oldWire) {
    oldWire.geometry.dispose();
    oldWire.material.dispose();
    workspace.remove(oldWire);
  }

  const newWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(workspaceRadius, 24, 16)),
    new THREE.LineBasicMaterial({
      color: 0xfaad14,
      transparent: true,
      opacity: 0.65,
    })
  );
  workspace.add(newWire);
}

function updateRadiusLabel() {
  radiusValueEl.textContent = `${workspaceRadius.toFixed(2)} m`;
}

function updateStatus(message) {
  statusEl.textContent = message;
}

function resetScene() {
  basePlaced = false;

  workspace.visible = false;
  robotBase.visible = false;
  targetPoint.visible = false;
  lineToTarget.visible = false;

  updateStatus("Reset complete. Tap once to place the robot base.");
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}