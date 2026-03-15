import * as THREE from "three";
import { URDFLoader } from "urdf-loader";

const video = document.getElementById("camera");
const statusEl = document.getElementById("status");

const sliders = {
  tx: document.getElementById("tx"),
  ty: document.getElementById("ty"),
  tz: document.getElementById("tz"),
  rx: document.getElementById("rx"),
  ry: document.getElementById("ry"),
  rz: document.getElementById("rz"),
  pointSize: document.getElementById("pointSize"),
  threshold: document.getElementById("threshold"),
};

const values = {
  tx: document.getElementById("txValue"),
  ty: document.getElementById("tyValue"),
  tz: document.getElementById("tzValue"),
  rx: document.getElementById("rxValue"),
  ry: document.getElementById("ryValue"),
  rz: document.getElementById("rzValue"),
  ps: document.getElementById("psValue"),
  th: document.getElementById("thValue"),
};

const toggleRobotBtn = document.getElementById("toggleRobot");
const toggleWorkspaceBtn = document.getElementById("toggleWorkspace");
const clearTargetBtn = document.getElementById("clearTarget");
const resetPoseBtn = document.getElementById("resetPose");

let scene, camera, renderer;
let robotGroup, workspaceGroup;
let workspacePointsMesh = null;
let targetPointMesh = null;

let workspaceLocalPoints = [];
let targetExists = false;

let robotVisible = true;
let workspaceVisible = true;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const placementPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2.0); // z = -2 plane

init();

async function init() {
  initThree();
  await startCamera();
  bindUI();

  robotGroup = new THREE.Group();
  workspaceGroup = new THREE.Group();
  scene.add(robotGroup);
  scene.add(workspaceGroup);

  await Promise.all([
    loadURDFModel(),
    loadWorkspacePoints(),
  ]);

  updatePoseFromUI();
  updateStatus("Ready.\nAdjust sliders to align the virtual robot with the real robot.\nTap the screen to place a target point.");
  animate();
}

function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  document.getElementById("app").appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 2, 2);
  scene.add(dirLight);

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onResize);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus("Camera API not supported in this browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error(err);
    updateStatus("Failed to open camera. Please allow camera permission.");
  }
}

function bindUI() {
  const updateLabel = () => {
    values.tx.textContent = Number(sliders.tx.value).toFixed(2);
    values.ty.textContent = Number(sliders.ty.value).toFixed(2);
    values.tz.textContent = Number(sliders.tz.value).toFixed(2);
    values.rx.textContent = sliders.rx.value;
    values.ry.textContent = sliders.ry.value;
    values.rz.textContent = sliders.rz.value;
    values.ps.textContent = Number(sliders.pointSize.value).toFixed(3);
    values.th.textContent = Number(sliders.threshold.value).toFixed(3);
  };

  Object.values(sliders).forEach(slider => {
    slider.addEventListener("input", () => {
      updateLabel();
      updatePoseFromUI();
      updateWorkspacePointSize();
      if (targetExists) {
        evaluateReachability();
      }
    });
  });

  toggleRobotBtn.addEventListener("click", () => {
    robotVisible = !robotVisible;
    robotGroup.visible = robotVisible;
    toggleRobotBtn.textContent = robotVisible ? "Hide Robot" : "Show Robot";
  });

  toggleWorkspaceBtn.addEventListener("click", () => {
    workspaceVisible = !workspaceVisible;
    workspaceGroup.visible = workspaceVisible;
    toggleWorkspaceBtn.textContent = workspaceVisible ? "Hide Workspace" : "Show Workspace";
  });

  clearTargetBtn.addEventListener("click", () => {
    if (targetPointMesh) {
      scene.remove(targetPointMesh);
      targetPointMesh.geometry.dispose();
      targetPointMesh.material.dispose();
      targetPointMesh = null;
    }
    targetExists = false;
    updateStatus("Target cleared.");
  });

  resetPoseBtn.addEventListener("click", () => {
    sliders.tx.value = "0";
    sliders.ty.value = "0";
    sliders.tz.value = "-2";
    sliders.rx.value = "0";
    sliders.ry.value = "0";
    sliders.rz.value = "0";
    updateLabel();
    updatePoseFromUI();
  });

  updateLabel();
}

async function loadURDFModel() {
  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);

  loader.packages = {
    "": "./robot/"
  };

  return new Promise((resolve, reject) => {
    loader.load(
      "./robot/robot.urdf",
      robot => {
        robot.traverse(obj => {
          if (obj.isMesh) {
            obj.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              metalness: 0.1,
              roughness: 0.75,
              transparent: true,
              opacity: 0.85
            });
          }
        });

        robotGroup.add(robot);
        resolve();
      },
      undefined,
      err => {
        console.error(err);
        updateStatus("Failed to load URDF model.\nCheck robot/robot.urdf and mesh paths.");
        reject(err);
      }
    );
  });
}

async function loadWorkspacePoints() {
  try {
    const res = await fetch("./workspace_points.json");
    const data = await res.json();

    workspaceLocalPoints = data.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(workspaceLocalPoints.length * 3);

    for (let i = 0; i < workspaceLocalPoints.length; i++) {
      positions[3 * i + 0] = workspaceLocalPoints[i].x;
      positions[3 * i + 1] = workspaceLocalPoints[i].y;
      positions[3 * i + 2] = workspaceLocalPoints[i].z;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xfaad14,
      size: Number(sliders.pointSize.value),
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72
    });

    workspacePointsMesh = new THREE.Points(geometry, material);
    workspaceGroup.add(workspacePointsMesh);
  } catch (err) {
    console.error(err);
    updateStatus("Failed to load workspace_points.json.\nRun the Python generator first.");
  }
}

function updatePoseFromUI() {
  const tx = Number(sliders.tx.value);
  const ty = Number(sliders.ty.value);
  const tz = Number(sliders.tz.value);

  const rx = THREE.MathUtils.degToRad(Number(sliders.rx.value));
  const ry = THREE.MathUtils.degToRad(Number(sliders.ry.value));
  const rz = THREE.MathUtils.degToRad(Number(sliders.rz.value));

  robotGroup.position.set(tx, ty, tz);
  workspaceGroup.position.set(tx, ty, tz);

  robotGroup.rotation.set(rx, ry, rz);
  workspaceGroup.rotation.set(rx, ry, rz);
}

function updateWorkspacePointSize() {
  if (!workspacePointsMesh) return;
  workspacePointsMesh.material.size = Number(sliders.pointSize.value);
}

function onPointerDown(event) {
  const point = screenToWorld(event.clientX, event.clientY);
  if (!point) return;
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

function placeTarget(worldPos) {
  if (targetPointMesh) {
    scene.remove(targetPointMesh);
    targetPointMesh.geometry.dispose();
    targetPointMesh.material.dispose();
  }

  const geometry = new THREE.SphereGeometry(0.03, 24, 24);
  const material = new THREE.MeshBasicMaterial({ color: 0x40a9ff });
  targetPointMesh = new THREE.Mesh(geometry, material);
  targetPointMesh.position.copy(worldPos);

  scene.add(targetPointMesh);
  targetExists = true;

  evaluateReachability();
}

function worldToWorkspaceLocal(worldPos) {
  return workspaceGroup.worldToLocal(worldPos.clone());
}

function evaluateReachability() {
  if (!targetExists || !targetPointMesh || workspaceLocalPoints.length === 0) return;

  const localTarget = worldToWorkspaceLocal(targetPointMesh.position);
  const threshold = Number(sliders.threshold.value);

  let minDist = Infinity;
  for (let i = 0; i < workspaceLocalPoints.length; i++) {
    const d = localTarget.distanceTo(workspaceLocalPoints[i]);
    if (d < minDist) minDist = d;
  }

  const reachable = minDist <= threshold;

  if (reachable) {
    targetPointMesh.material.color.set(0x52c41a);
  } else {
    targetPointMesh.material.color.set(0xff4d4f);
  }

  updateStatus(
    `Target world position:
x=${targetPointMesh.position.x.toFixed(3)}, y=${targetPointMesh.position.y.toFixed(3)}, z=${targetPointMesh.position.z.toFixed(3)}

Nearest workspace distance: ${minDist.toFixed(4)} m
Threshold: ${threshold.toFixed(4)} m
Result: ${reachable ? "Reachable" : "Unreachable"}`
  );
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}