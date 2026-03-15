// 打开手机相机
const video = document.getElementById("camera")

navigator.mediaDevices.getUserMedia({
video:{facingMode:"environment"}
}).then(stream=>{
video.srcObject = stream
})

// THREE.js 场景
const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(
70,
window.innerWidth/window.innerHeight,
0.01,
10
)

camera.position.z = 1

const renderer = new THREE.WebGLRenderer({alpha:true})
renderer.setSize(window.innerWidth,window.innerHeight)

document.body.appendChild(renderer.domElement)

// workspace
let radius = 0.8

let geometry = new THREE.SphereGeometry(radius,32,32)

const material = new THREE.MeshBasicMaterial({
color:0x00ff00,
transparent:true,
opacity:0.3
})

const workspace = new THREE.Mesh(geometry,material)

workspace.position.z = -1

scene.add(workspace)

// UI
const radiusSlider = document.getElementById("radius")

radiusSlider.oninput = function(){

radius = parseFloat(this.value)

workspace.geometry.dispose()

workspace.geometry = new THREE.SphereGeometry(radius,32,32)

}

// 点击移动 workspace
window.addEventListener("click",function(){

workspace.position.x = (Math.random()-0.5)*0.5
workspace.position.y = (Math.random()-0.5)*0.5

})

// 渲染
function animate(){

requestAnimationFrame(animate)

renderer.render(scene,camera)

}

animate()
