// ==========================================
// BACKGROUND
// Default: the animated Three.js particle field.
// Optional: a photo the user picks from their device, remembered for next
// time (like setting a browser homepage background).
// ==========================================

let scene, camera, renderer, starGeometry, stars, particleCount = 1000;
let mouseX = 0, mouseY = 0;
let threeInitialized = false;
let animationFrameId = null;

function init3DBackground() {
  if (threeInitialized) return;
  const container = document.getElementById('canvas-container');
  if (!container || typeof THREE === 'undefined') return;
  threeInitialized = true;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  starGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = [new THREE.Color(0x3b82f6), new THREE.Color(0x8b5cf6), new THREE.Color(0xec4899)];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1000;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1000;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
    const color = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const starMaterial = new THREE.PointsMaterial({
    size: 3,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) / 100;
    mouseY = (e.clientY - window.innerHeight / 2) / 100;
  });

  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate3D();
}

function animate3D() {
  animationFrameId = requestAnimationFrame(animate3D);
  if (stars) stars.rotation.z += 0.0008;
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function applyBackgroundPreference(pref) {
  const canvasContainer = document.getElementById('canvas-container');
  const customLayer = document.getElementById('customBackgroundLayer');
  if (!canvasContainer || !customLayer) return;

  if (pref && pref.type === 'custom' && pref.dataUrl) {
    canvasContainer.classList.add('hidden');
    customLayer.style.backgroundImage = `url("${pref.dataUrl}")`;
    customLayer.classList.remove('hidden');
  } else {
    customLayer.classList.add('hidden');
    customLayer.style.backgroundImage = '';
    canvasContainer.classList.remove('hidden');
    init3DBackground();
  }
}

// Downscale + re-encode the chosen photo so it fits comfortably in
// localStorage (a raw phone photo can be 5-10MB, well over most quota).
function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load that image.'));
      img.onload = () => {
        const maxWidth = 1920;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function initBackgroundFeature() {
  const pref = loadJSON(STORAGE_KEYS.BACKGROUND, { type: 'default' });
  applyBackgroundPreference(pref);

  const settingsBtn = document.getElementById('bgSettingsBtn');
  const modalEl = document.getElementById('backgroundModal');
  const fileInput = document.getElementById('bgFileInput');
  const dropZone = document.getElementById('bgDropZone');
  const resetBtn = document.getElementById('bgResetBtn');
  const preview = document.getElementById('bgPreviewImg');

  function refreshPreview() {
    const current = loadJSON(STORAGE_KEYS.BACKGROUND, { type: 'default' });
    if (current.type === 'custom' && current.dataUrl) {
      preview.src = current.dataUrl;
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
      preview.removeAttribute('src');
    }
  }

  settingsBtn?.addEventListener('click', () => {
    refreshPreview();
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  });

  dropZone?.addEventListener('click', () => fileInput.click());

  async function handleFile(file) {
    try {
      const dataUrl = await processImageFile(file);
      const newPref = { type: 'custom', dataUrl };
      if (saveJSON(STORAGE_KEYS.BACKGROUND, newPref)) {
        applyBackgroundPreference(newPref);
        refreshPreview();
        showToast('Background updated', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Could not set that image as background', 'error');
    }
  }

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach(evt =>
    dropZone?.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragging'); })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropZone?.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragging'); })
  );
  dropZone?.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  resetBtn?.addEventListener('click', () => {
    saveJSON(STORAGE_KEYS.BACKGROUND, { type: 'default' });
    applyBackgroundPreference({ type: 'default' });
    refreshPreview();
    showToast('Background reset to the default');
  });
}
