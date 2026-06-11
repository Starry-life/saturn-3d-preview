import * as THREE from "three";
import { handleSharedRequest, isSharedBackendConfigured } from "./shared-backend.js";
import "./style.css";

const canvas = document.querySelector("#saturn-scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setClearColor(0x0b2036, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.75;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1c2f, 0.0058);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
camera.position.set(-1.2, 3.8, 10.8);
camera.lookAt(1.78, -0.48, 0);

const root = new THREE.Group();
root.rotation.z = THREE.MathUtils.degToRad(-8);
scene.add(root);

const routePanel = document.querySelector("#route-panel");
const musicStar = document.querySelector("#music-star");
const musicAudio = document.querySelector("#bg-music");
let musicName = "星河默认氛围";
let storedMusicSrc = "";
let currentMusicObjectUrl = "";
const STORAGE_KEY = "graduation-star-atlas-state-v1";
const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

function readStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

const storedState = readStoredState();

function createMockPhotoSrc(photo) {
  const hue = (photo.id * 37) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="hsl(${hue}, 70%, 18%)"/>
          <stop offset="0.52" stop-color="hsl(${(hue + 36) % 360}, 72%, 34%)"/>
          <stop offset="1" stop-color="hsl(${(hue + 82) % 360}, 78%, 12%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="42%" r="55%">
          <stop stop-color="rgba(255,255,255,.9)"/>
          <stop offset=".28" stop-color="rgba(255,216,132,.38)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#bg)"/>
      <circle cx="620" cy="330" r="360" fill="url(#glow)" opacity=".8"/>
      <path d="M120 575 C300 500 380 635 560 555 C750 470 850 590 1080 510" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="6"/>
      <text x="70" y="112" fill="white" font-family="Arial, sans-serif" font-size="38" opacity=".78">GRADUATION PHOTO</text>
      <text x="70" y="705" fill="white" font-family="Georgia, serif" font-size="110" font-weight="700">#${photo.id}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const defaultPhotos = Array.from({ length: 100 }, (_, index) => {
  const id = index + 1;
  const photo = {
    id,
    src: "",
    clickCount: id <= 10 ? 3 : id <= 30 ? 2 : 1,
  };
  photo.src = createMockPhotoSrc(photo);
  return photo;
});

const storedPhotos = Array.isArray(storedState.photos) ? storedState.photos : [];
const photosByStoredId = new Map(storedPhotos.map((photo) => [Number(photo.id), photo]));
const photos = defaultPhotos.map((photo) => ({
  ...photo,
  ...(photosByStoredId.get(photo.id) ?? {}),
  id: photo.id,
}));
storedPhotos
  .filter((photo) => Number(photo.id) > defaultPhotos.length)
  .sort((a, b) => Number(a.id) - Number(b.id))
  .forEach((photo) => {
    photos.push({
      id: Number(photo.id),
      src: photo.src || createMockPhotoSrc({ id: Number(photo.id) }),
      clickCount: Number(photo.clickCount) || 0,
      name: photo.name || "",
      uploaderAccount: photo.uploaderAccount || "",
      replacedBy: photo.replacedBy || "",
    });
  });

function getRankedPhotos() {
  return [...photos].sort((a, b) => b.clickCount - a.clickCount || a.id - b.id);
}

function getTieredPhotos() {
  const ranked = getRankedPhotos();
  return {
    gold: ranked.slice(0, 10),
    silver: ranked.slice(10, 30),
    dust: ranked.slice(30),
  };
}

const photoTiers = getTieredPhotos();
const photosById = new Map(photos.map((photo) => [photo.id, photo]));
let nextPhotoId = Math.max(...photos.map((photo) => photo.id), 100) + 1;
const activityLogs = Array.isArray(storedState.activityLogs) ? storedState.activityLogs : [];
const RECORDS_ACCESS_CODE = "5708481";
const pendingPhotoReplacements = new Map();
if (storedState.musicName) musicName = storedState.musicName;
if (storedState.musicSrc) storedMusicSrc = storedState.musicSrc;

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        photos: photos.map((photo) => ({
          id: photo.id,
          src: photo.src,
          clickCount: photo.clickCount,
          name: photo.name || "",
          uploaderAccount: photo.uploaderAccount || "",
          replacedBy: photo.replacedBy || "",
        })),
        activityLogs,
        musicName,
        musicSrc: storedMusicSrc,
      }),
    );
  } catch (error) {
    console.warn("Local state save failed.", error);
  }
}

function mergeServerState(state) {
  if (!state) return;
  const incomingPhotos = Array.isArray(state.photos) ? state.photos : [];
  const incomingById = new Map(
    incomingPhotos
      .map((photo) => [Number(photo.id), photo])
      .filter(([id]) => Number.isFinite(id) && id > 0),
  );

  defaultPhotos.forEach((defaultPhoto) => {
    const incoming = incomingById.get(defaultPhoto.id);
    const existing = photosById.get(defaultPhoto.id);
    const normalized = {
      ...defaultPhoto,
      ...(incoming ?? {}),
      id: defaultPhoto.id,
      src: incoming?.src || defaultPhoto.src,
      clickCount: Number(incoming?.clickCount ?? defaultPhoto.clickCount),
      name: incoming?.name || "",
      uploaderAccount: incoming?.uploaderAccount || "",
      replacedBy: incoming?.replacedBy || "",
    };
    if (existing) Object.assign(existing, normalized);
  });

  for (let index = photos.length - 1; index >= 0; index -= 1) {
    const photo = photos[index];
    if (photo.id > defaultPhotos.length && !incomingById.has(photo.id)) {
      photosById.delete(photo.id);
      photos.splice(index, 1);
    }
  }

  incomingPhotos.filter((incoming) => Number(incoming.id) > defaultPhotos.length).forEach((incoming) => {
    const id = Number(incoming.id);
    if (!id) return;
    const existing = photosById.get(id);
    const normalized = {
      id,
      src: incoming.src || existing?.src || createMockPhotoSrc({ id }),
      clickCount: Number(incoming.clickCount ?? existing?.clickCount ?? 0),
      name: incoming.name || existing?.name || "",
      uploaderAccount: incoming.uploaderAccount || existing?.uploaderAccount || "",
      replacedBy: incoming.replacedBy || existing?.replacedBy || "",
    };
    if (existing) {
      Object.assign(existing, normalized);
    } else {
      photos.push(normalized);
      photosById.set(id, normalized);
    }
  });
  nextPhotoId = Number(state.nextPhotoId) || Math.max(...photos.map((photo) => photo.id), 100) + 1;
  if (state.musicName) musicName = state.musicName;
  if (state.musicSrc && state.musicSrc !== storedMusicSrc) {
    storedMusicSrc = state.musicSrc;
    musicAudio.src = storedMusicSrc;
  }
  if (Array.isArray(state.activityLogs)) {
    activityLogs.splice(0, activityLogs.length, ...state.activityLogs);
  }
  assignPhotoEntriesByRank();
  saveState();
  renderRoute();
}

async function requestJson(url, options = {}) {
  const sharedResponse = await handleSharedRequest(url, options);
  if (sharedResponse) return sharedResponse;
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Server request failed.");
  return data;
}

async function loadSharedState() {
  try {
    const state = await requestJson("/api/state");
    mergeServerState(state);
  } catch {
    // The app still works offline with browser-local storage.
  }
}

function isAuthorizedAccount(account) {
  const value = Number(String(account).trim());
  return (
    Number.isInteger(value) &&
    ((value >= 202324002001 && value <= 202324002090) ||
      (value >= 202324001001 && value <= 202324001050))
  );
}

function logActivity(type, account, photoId, fileName = "") {
  activityLogs.unshift({
    type,
    account: String(account).trim(),
    photoId,
    fileName,
    time: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
  saveState();
}

function photoTierLabel(photo) {
  const ranked = getRankedPhotos();
  const rank = ranked.findIndex((item) => item.id === photo.id) + 1;
  if (rank <= 10) return "金色星辰";
  if (rank <= 30) return "银蓝星辰";
  return "星尘微粒";
}

function createPlanetTexture() {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 1024;
  canvasTexture.height = 512;
  const ctx = canvasTexture.getContext("2d");
  const dome = ctx.createLinearGradient(0, 0, 0, canvasTexture.height);
  dome.addColorStop(0, "#061221");
  dome.addColorStop(0.18, "#0a2540");
  dome.addColorStop(0.38, "#102f55");
  dome.addColorStop(0.56, "#071728");
  dome.addColorStop(0.76, "#0f2a46");
  dome.addColorStop(1, "#030711");
  ctx.fillStyle = dome;
  ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  const rng = mulberry32(202606);

  for (let i = 0; i < 48; i += 1) {
    const cx = rng() * canvasTexture.width;
    const cy = rng() * canvasTexture.height;
    const radius = 32 + rng() * 140;
    const cloud = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.35);
    cloud.addColorStop(0, rng() > 0.55 ? "rgba(48,146,205,0.16)" : "rgba(87,91,177,0.12)");
    cloud.addColorStop(0.45, "rgba(34,78,128,0.055)");
    cloud.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * (1.5 + rng() * 2.4), radius * (0.16 + rng() * 0.32), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let arm = 0; arm < 5; arm += 1) {
    const cy = canvasTexture.height * (0.2 + arm * 0.14);
    const phase = rng() * Math.PI * 2;
    ctx.beginPath();
    for (let x = -60; x <= canvasTexture.width + 60; x += 12) {
      const progress = x / canvasTexture.width;
      const y =
        cy +
        Math.sin(progress * Math.PI * 2.15 + phase) * (40 + arm * 5) +
        Math.sin(progress * Math.PI * 5.4 + phase * 0.4) * 12;
      if (x === -60) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = arm % 2 === 0 ? "rgba(255,209,105,0.18)" : "rgba(240,250,255,0.13)";
    ctx.lineWidth = 7 + arm * 1.4;
    ctx.shadowColor = arm % 2 === 0 ? "rgba(255,198,74,0.34)" : "rgba(172,224,255,0.28)";
    ctx.shadowBlur = 14;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  for (let i = 0; i < 760; i += 1) {
    const x = rng() * canvasTexture.width;
    const y = rng() * canvasTexture.height;
    const nearArm = Math.sin((x / canvasTexture.width) * Math.PI * 5 + y * 0.018);
    const alpha = 0.08 + rng() * 0.35 + Math.max(0, nearArm) * 0.08;
    const r = rng() > 0.96 ? 1.6 + rng() * 2.6 : 0.45 + rng() * 1.0;
    ctx.fillStyle = rng() > 0.68 ? `rgba(255,218,128,${alpha})` : `rgba(218,244,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const lowerCloud = ctx.createLinearGradient(0, canvasTexture.height * 0.58, 0, canvasTexture.height);
  lowerCloud.addColorStop(0, "rgba(0,0,0,0)");
  lowerCloud.addColorStop(0.56, "rgba(206,229,238,0.09)");
  lowerCloud.addColorStop(0.78, "rgba(255,245,220,0.14)");
  lowerCloud.addColorStop(1, "rgba(26,46,68,0.18)");
  ctx.fillStyle = lowerCloud;
  ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  for (let i = 0; i < 34; i += 1) {
    const x = rng() * canvasTexture.width;
    const y = canvasTexture.height * (0.72 + rng() * 0.2);
    const r = 32 + rng() * 100;
    const mist = ctx.createRadialGradient(x, y, 0, x, y, r);
    mist.addColorStop(0, "rgba(241,249,255,0.16)");
    mist.addColorStop(0.45, "rgba(170,202,222,0.055)");
    mist.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mist;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1.6 + rng() * 2), r * (0.14 + rng() * 0.18), rng() * Math.PI * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createPlanetLightsTexture() {
  const lightCanvas = document.createElement("canvas");
  lightCanvas.width = 1024;
  lightCanvas.height = 512;
  const ctx = lightCanvas.getContext("2d");
  const rng = mulberry32(7072026);
  ctx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let arm = 0; arm < 7; arm += 1) {
    const centerY = lightCanvas.height * (0.18 + arm * 0.095);
    const phase = rng() * Math.PI * 2;
    ctx.beginPath();
    for (let x = -80; x <= lightCanvas.width + 80; x += 10) {
      const t = x / lightCanvas.width;
      const y =
        centerY +
        Math.sin(t * Math.PI * 2.4 + phase) * (42 + arm * 3.5) +
        Math.sin(t * Math.PI * 7.2 + phase * 0.3) * 8;
      if (x === -80) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const gold = arm % 3 !== 1;
    ctx.strokeStyle = gold ? "rgba(255,204,86,0.42)" : "rgba(246,252,255,0.32)";
    ctx.lineWidth = gold ? 2.2 + rng() * 2.2 : 1.2 + rng() * 1.6;
    ctx.shadowColor = gold ? "rgba(255,184,55,0.62)" : "rgba(205,240,255,0.48)";
    ctx.shadowBlur = gold ? 14 : 10;
    ctx.stroke();
  }

  for (let arm = 0; arm < 3; arm += 1) {
    const cx = lightCanvas.width * (0.42 + arm * 0.12);
    const cy = lightCanvas.height * (0.34 + arm * 0.11);
    ctx.beginPath();
    for (let i = 0; i < 220; i += 1) {
      const t = i / 219;
      const angle = t * Math.PI * (2.25 + arm * 0.32) + arm * 1.8;
      const radius = 24 + t * (190 + arm * 38);
      const x = cx + Math.cos(angle) * radius * 1.65;
      const y = cy + Math.sin(angle) * radius * 0.38;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = arm === 1 ? "rgba(255,247,218,0.38)" : "rgba(255,193,67,0.5)";
    ctx.lineWidth = arm === 1 ? 1.4 : 2.8;
    ctx.shadowColor = arm === 1 ? "rgba(225,245,255,0.45)" : "rgba(255,181,48,0.78)";
    ctx.shadowBlur = arm === 1 ? 12 : 18;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  for (let i = 0; i < 420; i += 1) {
    const x = rng() * lightCanvas.width;
    const y = rng() * lightCanvas.height;
    const radius = rng() > 0.94 ? 1.8 + rng() * 3.8 : 0.55 + rng() * 1.5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
    const warm = rng() > 0.54;
    glow.addColorStop(0, warm ? `rgba(255,226,142,${0.42 + rng() * 0.44})` : `rgba(235,252,255,${0.42 + rng() * 0.42})`);
    glow.addColorStop(0.42, warm ? `rgba(255,185,62,${0.09 + rng() * 0.15})` : `rgba(116,211,255,${0.08 + rng() * 0.13})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
  }

  for (let i = 0; i < 26; i += 1) {
    const x = rng() * lightCanvas.width;
    const y = rng() * lightCanvas.height * 0.72;
    const len = 18 + rng() * 46;
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 0.8 + rng() * 0.8;
    ctx.shadowColor = "rgba(155,220,255,0.8)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x - len * 0.5, y);
    ctx.lineTo(x + len * 0.5, y);
    ctx.moveTo(x, y - len * 0.25);
    ctx.lineTo(x, y + len * 0.25);
    ctx.stroke();
  }

  for (let i = 0; i < 28; i += 1) {
    const x = rng() * lightCanvas.width;
    const y = lightCanvas.height * (0.68 + rng() * 0.18);
    const r = 24 + rng() * 86;
    const mist = ctx.createRadialGradient(x, y, 0, x, y, r);
    mist.addColorStop(0, "rgba(245,251,255,0.18)");
    mist.addColorStop(0.46, "rgba(170,214,239,0.065)");
    mist.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mist;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1.4 + rng() * 1.8), r * (0.12 + rng() * 0.14), rng() * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(lightCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createBackdropTexture() {
  const backdropCanvas = document.createElement("canvas");
  backdropCanvas.width = 1600;
  backdropCanvas.height = 1000;
  const ctx = backdropCanvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, backdropCanvas.width, backdropCanvas.height);
  base.addColorStop(0, "#071323");
  base.addColorStop(0.34, "#0b182b");
  base.addColorStop(0.62, "#08101f");
  base.addColorStop(1, "#03060d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);

  const rng = mulberry32(778899);

  const solarGlow = ctx.createRadialGradient(
    backdropCanvas.width * 0.1,
    backdropCanvas.height * 0.2,
    0,
    backdropCanvas.width * 0.1,
    backdropCanvas.height * 0.2,
    760,
  );
  solarGlow.addColorStop(0, "rgba(123,205,255,0.22)");
  solarGlow.addColorStop(0.16, "rgba(72,156,255,0.09)");
  solarGlow.addColorStop(0.56, "rgba(39,81,132,0.035)");
  solarGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = solarGlow;
  ctx.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);

  const distantCore = ctx.createRadialGradient(
    backdropCanvas.width * 0.68,
    backdropCanvas.height * 0.26,
    0,
    backdropCanvas.width * 0.68,
    backdropCanvas.height * 0.26,
    620,
  );
  distantCore.addColorStop(0, "rgba(117,202,255,0.24)");
  distantCore.addColorStop(0.34, "rgba(58,137,224,0.11)");
  distantCore.addColorStop(0.74, "rgba(19,56,104,0.045)");
  distantCore.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = distantCore;
  ctx.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);

  const hazeLayers = [
    { x: 0.18, y: 0.2, r: 620, color: [54, 143, 213], a: 0.12 },
    { x: 0.84, y: 0.18, r: 520, color: [49, 93, 176], a: 0.105 },
    { x: 0.38, y: 0.82, r: 760, color: [31, 122, 170], a: 0.09 },
    { x: 0.88, y: 0.78, r: 680, color: [70, 112, 210], a: 0.075 },
  ];
  hazeLayers.forEach((layer) => {
    const cx = backdropCanvas.width * layer.x;
    const cy = backdropCanvas.height * layer.y;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.r);
    gradient.addColorStop(0, `rgba(${layer.color[0]},${layer.color[1]},${layer.color[2]},${layer.a})`);
    gradient.addColorStop(0.48, `rgba(${layer.color[0]},${layer.color[1]},${layer.color[2]},${layer.a * 0.42})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);
  });

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(backdropCanvas.width * 0.52, backdropCanvas.height * 0.48);
  ctx.rotate(-0.34);
  ctx.scale(1.55, 0.38);
  const galaxyCore = ctx.createRadialGradient(0, 0, 40, 0, 0, 520);
  galaxyCore.addColorStop(0, "rgba(204,238,255,0.2)");
  galaxyCore.addColorStop(0.22, "rgba(88,176,255,0.12)");
  galaxyCore.addColorStop(0.68, "rgba(51,91,190,0.05)");
  galaxyCore.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = galaxyCore;
  ctx.fillRect(-680, -420, 1360, 840);
  for (let i = 0; i < 2400; i += 1) {
    const angle = (rng() - 0.5) * Math.PI * 1.8;
    const radius = Math.pow(rng(), 0.7) * 540;
    const x = Math.cos(angle) * radius + (rng() - 0.5) * 36;
    const y = Math.sin(angle) * radius * 0.26 + (rng() - 0.5) * 48;
    const alpha = 0.045 + rng() * 0.22;
    const size = 0.22 + rng() * 1.35;
    ctx.fillStyle = rng() > 0.82 ? `rgba(255,246,218,${alpha})` : `rgba(142,210,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let layer = 0; layer < 4; layer += 1) {
    ctx.save();
    ctx.translate(backdropCanvas.width * (0.44 + rng() * 0.18), backdropCanvas.height * (0.43 + rng() * 0.12));
    ctx.rotate(-0.28 + rng() * 0.16);
    ctx.scale(1.35 + layer * 0.12, 0.36 + layer * 0.035);
    for (let i = 0; i < 34; i += 1) {
      const y = -260 + rng() * 520;
      const length = 360 + rng() * 620;
      ctx.beginPath();
      ctx.moveTo(-length * 0.5, y);
      for (let x = -length * 0.5; x < length * 0.5; x += 44) {
        ctx.lineTo(x, y + Math.sin(x * 0.011 + i * 0.35) * (16 + layer * 4) + (rng() - 0.5) * 12);
      }
      const cool = rng() > 0.58;
      ctx.strokeStyle = cool
        ? `rgba(92,158,202,${0.003 + rng() * 0.01})`
        : `rgba(119,96,157,${0.003 + rng() * 0.008})`;
      ctx.lineWidth = 22 + rng() * 42;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  for (let i = 0; i < 5600; i += 1) {
    const x = rng() * backdropCanvas.width;
    const y = rng() * backdropCanvas.height;
    const depth = rng();
    const radius = depth > 0.994 ? 1.35 + rng() * 1.05 : depth > 0.94 ? 0.58 + rng() * 0.42 : 0.18 + rng() * 0.34;
    const alpha = depth > 0.994 ? 0.56 + rng() * 0.24 : depth > 0.94 ? 0.18 + rng() * 0.28 : 0.045 + rng() * 0.18;
    const temp = rng();
    ctx.fillStyle = temp > 0.88 ? `rgba(232,246,255,${alpha})` : temp > 0.5 ? `rgba(156,211,255,${alpha})` : `rgba(93,170,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 18; i += 1) {
    const x = rng() * backdropCanvas.width;
    const y = rng() * backdropCanvas.height;
    const r = 8 + rng() * 18;
    const star = ctx.createRadialGradient(x, y, 0, x, y, r);
    star.addColorStop(0, "rgba(230,248,255,0.86)");
    star.addColorStop(0.2, "rgba(96,182,255,0.34)");
    star.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = star;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const vignette = ctx.createRadialGradient(
    backdropCanvas.width * 0.5,
    backdropCanvas.height * 0.48,
    260,
    backdropCanvas.width * 0.5,
    backdropCanvas.height * 0.48,
    920,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.66, "rgba(0,0,0,0.16)");
  vignette.addColorStop(1, "rgba(0,0,0,0.56)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, backdropCanvas.width, backdropCanvas.height);

  const texture = new THREE.CanvasTexture(backdropCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRingTexture(seed = 606202, brightness = 1) {
  const ringCanvas = document.createElement("canvas");
  ringCanvas.width = 2048;
  ringCanvas.height = 96;
  const ctx = ringCanvas.getContext("2d");
  ctx.clearRect(0, 0, ringCanvas.width, ringCanvas.height);
  const rng = mulberry32(seed);

  for (let y = 0; y < ringCanvas.height; y += 1) {
    const t = y / ringCanvas.height;
    const core = Math.exp(-Math.pow((t - 0.52) / 0.23, 2));
    const goldLane = Math.exp(-Math.pow((t - 0.42) / 0.08, 2)) + Math.exp(-Math.pow((t - 0.66) / 0.07, 2)) * 0.74;
    const blueLane = Math.exp(-Math.pow((t - 0.28) / 0.08, 2)) + Math.exp(-Math.pow((t - 0.82) / 0.08, 2)) * 0.55;
    const alpha = (core * 0.075 + goldLane * 0.055 + blueLane * 0.026) * brightness;
    const red = Math.round(185 + goldLane * 70 + blueLane * 8);
    const green = Math.round(194 + goldLane * 44 + blueLane * 24);
    const blue = Math.round(218 - goldLane * 66 + blueLane * 36);
    ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
    ctx.fillRect(0, y, ringCanvas.width, 1);
  }

  for (let i = 0; i < 9800; i += 1) {
    const x = rng() * ringCanvas.width;
    const lane = rng() > 0.5 ? 0.42 : rng() > 0.45 ? 0.66 : 0.52;
    const y = ringCanvas.height * lane + (rng() - 0.5) * ringCanvas.height * (0.52 + rng() * 0.18);
    const a = 0.06 + rng() * 0.72;
    const w = rng() > 0.88 ? 2 + rng() * 8 : 0.8 + rng() * 2.2;
    const h = rng() > 0.92 ? 1.4 + rng() * 2.3 : 0.8 + rng() * 1.2;
    const pick = rng();
    ctx.fillStyle =
      pick > 0.58
        ? `rgba(255,203,82,${a})`
        : pick > 0.28
          ? `rgba(245,251,255,${a * 0.86})`
          : `rgba(147,204,255,${a * 0.56})`;
    ctx.fillRect(x, y, w, h);
  }

  for (let i = 0; i < 34; i += 1) {
    const y = ringCanvas.height * (0.16 + rng() * 0.72);
    const x = rng() * ringCanvas.width;
    const length = 42 + rng() * 150;
    const glow = ctx.createLinearGradient(x, y, x + length, y);
    glow.addColorStop(0, "rgba(255,215,128,0)");
    glow.addColorStop(0.44, `rgba(255,198,82,${0.14 + rng() * 0.14})`);
    glow.addColorStop(0.62, `rgba(255,255,238,${0.08 + rng() * 0.1})`);
    glow.addColorStop(1, "rgba(255,215,128,0)");
    ctx.strokeStyle = glow;
    ctx.lineWidth = 0.8 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (rng() - 0.5) * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 42; i += 1) {
    const x = rng() * ringCanvas.width;
    const y = ringCanvas.height * (0.22 + rng() * 0.62);
    const len = 8 + rng() * 22;
    ctx.strokeStyle = rng() > 0.55 ? "rgba(255,244,214,0.5)" : "rgba(150,212,255,0.42)";
    ctx.lineWidth = 0.7 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - len, y);
    ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - len * 0.45);
    ctx.lineTo(x, y + len * 0.45);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(ringCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2.5, 1);
  texture.anisotropy = 16;
  return texture;
}

function createSparkTexture() {
  const sparkCanvas = document.createElement("canvas");
  sparkCanvas.width = 128;
  sparkCanvas.height = 128;
  const ctx = sparkCanvas.getContext("2d");
  const center = 64;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, 56);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.16, "rgba(255,245,210,0.76)");
  glow.addColorStop(0.44, "rgba(126,205,255,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(167,220,255,0.7)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(12, center);
  ctx.lineTo(116, center);
  ctx.moveTo(center, 16);
  ctx.lineTo(center, 112);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(sparkCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSmallPlanetTexture(colors, seed = 1) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, textureCanvas.height);
  colors.forEach((stop, index) => {
    gradient.addColorStop(index / (colors.length - 1), stop);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  const rng = mulberry32(seed);
  for (let i = 0; i < 32; i += 1) {
    const y = rng() * textureCanvas.height;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + rng() * 0.07})`;
    ctx.fillRect(0, y, textureCanvas.width, 1 + rng() * 4);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNebulaTexture(seed = 76606, color = [255, 194, 116]) {
  const nebulaCanvas = document.createElement("canvas");
  nebulaCanvas.width = 1024;
  nebulaCanvas.height = 512;
  const ctx = nebulaCanvas.getContext("2d");
  const rng = mulberry32(seed);
  ctx.clearRect(0, 0, nebulaCanvas.width, nebulaCanvas.height);

  for (let i = 0; i < 18; i += 1) {
    const x = rng() * nebulaCanvas.width;
    const y = rng() * nebulaCanvas.height;
    const radius = 120 + rng() * 280;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${0.05 + rng() * 0.08})`);
    gradient.addColorStop(0.46, `rgba(${color[0]},${color[1]},${color[2]},${0.018 + rng() * 0.035})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, nebulaCanvas.width, nebulaCanvas.height);
  }

  for (let i = 0; i < 1500; i += 1) {
    const x = rng() * nebulaCanvas.width;
    const y = rng() * nebulaCanvas.height;
    const alpha = rng() * 0.34;
    ctx.fillStyle = `rgba(255,238,196,${alpha})`;
    ctx.fillRect(x, y, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }

  const texture = new THREE.CanvasTexture(nebulaCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createReferenceDomeTexture() {
  const texture = new THREE.TextureLoader().load(assetUrl("reference-dome-texture.jpg"));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.center.set(0.5, 0.5);
  texture.offset.set(0, 0.03);
  texture.repeat.set(1, 0.94);
  return texture;
}

function createReferenceDomeDiscTexture() {
  const texture = new THREE.TextureLoader().load(assetUrl("reference-dome-disc.png"));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

function createReferenceGalaxyBackgroundTexture() {
  const backgroundTexture = new THREE.TextureLoader().load(assetUrl("galaxy-dome-16x9-clean.jpg"));
  backgroundTexture.colorSpace = THREE.SRGBColorSpace;
  backgroundTexture.anisotropy = 16;
  return backgroundTexture;

  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 2560;
  canvasTexture.height = 1440;
  const ctx = canvasTexture.getContext("2d");
  const rng = mulberry32(20260607);
  const width = canvasTexture.width;
  const height = canvasTexture.height;

  const space = ctx.createLinearGradient(0, 0, 0, height);
  space.addColorStop(0, "#061327");
  space.addColorStop(0.34, "#0a2340");
  space.addColorStop(0.7, "#071628");
  space.addColorStop(1, "#040a16");
  ctx.fillStyle = space;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const milky = ctx.createLinearGradient(width * 0.22, 0, width * 0.92, height);
  milky.addColorStop(0, "rgba(67, 151, 255, 0)");
  milky.addColorStop(0.24, "rgba(81, 170, 255, 0.22)");
  milky.addColorStop(0.48, "rgba(185, 217, 255, 0.18)");
  milky.addColorStop(0.72, "rgba(74, 142, 255, 0.16)");
  milky.addColorStop(1, "rgba(20, 52, 116, 0)");
  ctx.translate(width * 0.57, height * 0.36);
  ctx.rotate(-0.22);
  ctx.fillStyle = milky;
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.48, height * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 42; i += 1) {
    const x = width * (0.18 + rng() * 0.72);
    const y = height * (0.06 + rng() * 0.46);
    const radius = 120 + rng() * 360;
    const nebula = ctx.createRadialGradient(x, y, 0, x, y, radius);
    nebula.addColorStop(0, rng() > 0.58 ? "rgba(88, 169, 255, 0.13)" : "rgba(153, 176, 255, 0.1)");
    nebula.addColorStop(0.45, "rgba(70, 118, 196, 0.045)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = nebula;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 2300; i += 1) {
    const x = rng() * width;
    const y = rng() * height * 0.76;
    const milkyBias = Math.max(0, 1 - Math.abs(y - (height * 0.24 + x * 0.18)) / 360);
    const alpha = 0.16 + rng() * 0.62 + milkyBias * 0.24;
    const radius = rng() > 0.975 ? 1.8 + rng() * 3.4 : 0.5 + rng() * 1.25;
    ctx.fillStyle = rng() > 0.78 ? `rgba(255, 217, 132, ${alpha})` : `rgba(211, 239, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 22; i += 1) {
    const x = rng() * width;
    const y = rng() * height * 0.46;
    const size = 12 + rng() * 28;
    ctx.strokeStyle = rng() > 0.45 ? "rgba(199, 230, 255, 0.72)" : "rgba(255, 206, 111, 0.66)";
    ctx.lineWidth = 1 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
  ctx.restore();

  const horizonGlow = ctx.createRadialGradient(width * 0.52, height * 0.74, width * 0.08, width * 0.52, height * 0.74, width * 0.5);
  horizonGlow.addColorStop(0, "rgba(255, 226, 151, 0.34)");
  horizonGlow.addColorStop(0.28, "rgba(94, 170, 255, 0.16)");
  horizonGlow.addColorStop(0.72, "rgba(55, 101, 170, 0.05)");
  horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const cx = width * 0.5;
  const cy = height * 1.04;
  const rx = width * 0.48;
  const ry = height * 0.62;
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i += 1) {
    const inset = i * 13;
    ctx.strokeStyle = `rgba(${205 + i * 4}, ${229 + i * 2}, 255, ${0.11 - i * 0.006})`;
    ctx.lineWidth = 8 - i * 0.28;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - inset, ry - inset * 0.45, 0, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(239, 248, 255, 0.82)";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(145, 201, 255, 0.8)";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();
  ctx.restore();

  const cloudGradient = ctx.createLinearGradient(0, height * 0.68, 0, height);
  cloudGradient.addColorStop(0, "rgba(0,0,0,0)");
  cloudGradient.addColorStop(0.45, "rgba(204,224,242,0.22)");
  cloudGradient.addColorStop(0.7, "rgba(255,234,205,0.18)");
  cloudGradient.addColorStop(1, "rgba(5,12,24,0.72)");
  ctx.fillStyle = cloudGradient;
  ctx.fillRect(0, height * 0.54, width, height * 0.46);

  for (let i = 0; i < 46; i += 1) {
    const x = rng() * width;
    const y = height * (0.72 + rng() * 0.16);
    const radius = 70 + rng() * 190;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, "rgba(240, 247, 255, 0.2)");
    cloud.addColorStop(0.5, "rgba(137, 171, 206, 0.07)");
    cloud.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (1.6 + rng()), radius * (0.22 + rng() * 0.18), rng() * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

scene.background = createReferenceGalaxyBackgroundTexture();

const planetGeometry = new THREE.SphereGeometry(2.05, 96, 64);
const planetMaterial = new THREE.MeshBasicMaterial({
  map: createReferenceDomeTexture(),
  color: new THREE.Color(0xffffff),
});

const saturnSystem = new THREE.Group();
saturnSystem.position.set(0, -0.34, 0);
root.add(saturnSystem);

const orbitPivot = new THREE.Group();
saturnSystem.add(orbitPivot);

const planet = new THREE.Mesh(planetGeometry, planetMaterial);
orbitPivot.add(planet);

const referenceDomeFront = new THREE.Mesh(
  new THREE.CircleGeometry(2.06, 160),
  new THREE.MeshBasicMaterial({
    map: createReferenceDomeDiscTexture(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
  }),
);
referenceDomeFront.position.z = 0.09;
referenceDomeFront.renderOrder = 1;
orbitPivot.add(referenceDomeFront);

const planetLights = new THREE.Mesh(
  new THREE.SphereGeometry(2.055, 96, 64),
  new THREE.MeshBasicMaterial({
    map: createPlanetLightsTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
orbitPivot.add(planetLights);

const planetGlow = new THREE.Mesh(
  new THREE.SphereGeometry(2.09, 96, 64),
  new THREE.MeshBasicMaterial({
    color: 0xf2fbff,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  }),
);
orbitPivot.add(planetGlow);

const ringTexture = createRingTexture();
const ringGroup = new THREE.Group();
// RingGeometry is created in the local XY plane. Rotating the whole ring group
// once makes that plane the planet's XZ equator, so rings and particles stay locked to Saturn.
ringGroup.rotation.x = Math.PI / 2;
orbitPivot.add(ringGroup);

const ringMaterial = new THREE.MeshBasicMaterial({
  map: ringTexture,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
const ringMesh = new THREE.Mesh(new THREE.RingGeometry(2.65, 5.9, 256, 16), ringMaterial);
ringMesh.renderOrder = 4;
ringGroup.add(ringMesh);

const ringLanes = [
  { inner: 2.82, outer: 3.04, opacity: 0.32, speed: 0.044, seed: 118 },
  { inner: 3.48, outer: 3.82, opacity: 0.38, speed: 0.031, seed: 226 },
  { inner: 4.38, outer: 4.86, opacity: 0.32, speed: 0.02, seed: 339 },
  { inner: 5.12, outer: 5.76, opacity: 0.25, speed: 0.013, seed: 441 },
].map((lane) => {
  const texture = createRingTexture(lane.seed, 1.4);
  texture.repeat.set(5.8, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: lane.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(lane.inner, lane.outer, 256, 2), material);
  mesh.renderOrder = 5;
  ringGroup.add(mesh);
  return { ...lane, texture };
});

const dustPhotos = photoTiers.dust;
const particleCount = 10000;
const particlePositions = new Float32Array(particleCount * 3);
const particleColors = new Float32Array(particleCount * 3);
const photoDustPositions = new Float32Array(particleCount * 3);
const photoDustColors = new Float32Array(particleCount * 3);
const particleMeta = [];
const rng = mulberry32(826606);
const photoDustPalette = [
  [1.0, 0.78, 0.28], // gold
  [0.9, 0.96, 1.0], // silver
  [0.38, 0.74, 1.0], // blue
  [0.76, 0.48, 1.0], // purple
  [1.0, 0.34, 0.32], // red
  [1.0, 0.56, 0.2], // orange
  [0.34, 1.0, 0.58], // green
  [1.0, 1.0, 1.0], // white
  [1.0, 0.92, 0.28], // yellow
];

function stableDustColor(photo, seedTone) {
  const id = Number(photo?.id ?? 0);
  const paletteIndex = Math.abs((id * 9301 + 49297) % photoDustPalette.length);
  const base = photoDustPalette[paletteIndex];
  const lift = 0.84 + seedTone * 0.22;
  return base.map((channel) => Math.min(1, channel * lift));
}

function setParticleColor(index, photo, seedTone) {
  const colorIndex = index * 3;
  if (!photo) {
    particleColors[colorIndex] = 0.18 + seedTone * 0.08;
    particleColors[colorIndex + 1] = 0.26 + seedTone * 0.12;
    particleColors[colorIndex + 2] = 0.42 + seedTone * 0.2;
    return;
  }
  const [red, green, blue] = stableDustColor(photo, seedTone);
  particleColors[colorIndex] = red;
  particleColors[colorIndex + 1] = green;
  particleColors[colorIndex + 2] = blue;
}

function setPhotoDustColor(index, photo, seedTone) {
  const colorIndex = index * 3;
  const [red, green, blue] = photo ? stableDustColor(photo, seedTone) : [0, 0, 0];
  photoDustColors[colorIndex] = red;
  photoDustColors[colorIndex + 1] = green;
  photoDustColors[colorIndex + 2] = blue;
}

function hidePhotoDust(index) {
  photoDustPositions[index * 3 + 0] = 9999;
  photoDustPositions[index * 3 + 1] = 9999;
  photoDustPositions[index * 3 + 2] = 9999;
}

for (let i = 0; i < particleCount; i += 1) {
  const photo = dustPhotos[i];
  const lane = 2.68 + Math.pow(rng(), 0.72) * 3.12;
  const normalizedLane = (lane - 2.72) / 3.05;
  const innerFastSpeed = THREE.MathUtils.lerp(0.58, 0.16, normalizedLane);
  const tone = rng();
  particleMeta.push({
    photoId: photo?.id ?? null,
    radius: lane,
    angle: rng() * Math.PI * 2,
    speed: innerFastSpeed * (0.84 + rng() * 0.32),
    bob: rng() * 0.018,
    phase: rng() * Math.PI * 2,
    laneOffset: (rng() - 0.5) * 0.035,
    tone,
  });
  setParticleColor(i, photo, tone);
  setPhotoDustColor(i, photo, tone);
  hidePhotoDust(i);
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
const particleMaterial = new THREE.PointsMaterial({
  size: 0.018,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.94,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const ringParticles = new THREE.Points(particleGeometry, particleMaterial);
ringParticles.userData.kind = "dust";
ringParticles.renderOrder = 6;
ringGroup.add(ringParticles);

const photoDustGeometry = new THREE.BufferGeometry();
photoDustGeometry.setAttribute("position", new THREE.BufferAttribute(photoDustPositions, 3));
photoDustGeometry.setAttribute("color", new THREE.BufferAttribute(photoDustColors, 3));
const photoDustMaterial = new THREE.PointsMaterial({
  map: createSparkTexture(),
  size: 0.074,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.96,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
});
const photoDustPoints = new THREE.Points(photoDustGeometry, photoDustMaterial);
photoDustPoints.userData.kind = "photo-dust";
photoDustPoints.renderOrder = 6.5;
ringGroup.add(photoDustPoints);

const silverPhotos = photoTiers.silver;
const brightStarCount = silverPhotos.length;
const brightStarPositions = new Float32Array(brightStarCount * 3);
const brightStarColors = new Float32Array(brightStarCount * 3);
const brightStarMeta = [];
const brightStarRng = mulberry32(11882026);
for (let i = 0; i < brightStarCount; i += 1) {
  const photo = silverPhotos[i];
  const lane = 2.86 + Math.pow(brightStarRng(), 0.7) * 2.86;
  const normalizedLane = (lane - 2.86) / 2.86;
  brightStarMeta.push({
    photoId: photo.id,
    radius: lane,
    angle: brightStarRng() * Math.PI * 2,
    speed: THREE.MathUtils.lerp(0.34, 0.1, normalizedLane) * (0.76 + brightStarRng() * 0.36),
    bob: 0.008 + brightStarRng() * 0.02,
    phase: brightStarRng() * Math.PI * 2,
  });
  const tone = brightStarRng();
  brightStarColors[i * 3 + 0] = 0.72 + tone * 0.2;
  brightStarColors[i * 3 + 1] = 0.88 + tone * 0.1;
  brightStarColors[i * 3 + 2] = 1;
}

const brightStarGeometry = new THREE.BufferGeometry();
brightStarGeometry.setAttribute("position", new THREE.BufferAttribute(brightStarPositions, 3));
brightStarGeometry.setAttribute("color", new THREE.BufferAttribute(brightStarColors, 3));
const brightStarAlpha = new Float32Array(brightStarCount);
brightStarGeometry.setAttribute("alpha", new THREE.BufferAttribute(brightStarAlpha, 1));
const brightStarMaterial = new THREE.PointsMaterial({
  map: createSparkTexture(),
  size: 0.12,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const brightRingStars = new THREE.Points(brightStarGeometry, brightStarMaterial);
brightRingStars.userData.kind = "silver";
brightRingStars.renderOrder = 7;
ringGroup.add(brightRingStars);

const goldPhotos = photoTiers.gold;
const foregroundSparkCount = goldPhotos.length;
const foregroundSparks = [];
const foregroundSparkRng = mulberry32(66342026);
for (let i = 0; i < foregroundSparkCount; i += 1) {
  const photo = goldPhotos[i];
  const material = new THREE.SpriteMaterial({
    map: createSparkTexture(),
    color: 0xffc85b,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  const radius = 3.0 + Math.pow(foregroundSparkRng(), 0.72) * 2.62;
  const baseScale = 0.48 + foregroundSparkRng() * 0.28;
  foregroundSparks.push({
    sprite,
    photoId: photo.id,
    radius,
    angle: Math.PI * 1.06 + foregroundSparkRng() * Math.PI * 0.88,
    speed: THREE.MathUtils.lerp(0.3, 0.11, (radius - 2.92) / 2.72) * (0.74 + foregroundSparkRng() * 0.32),
    phase: foregroundSparkRng() * Math.PI * 2,
    baseScale,
  });
  sprite.userData.photoId = photo.id;
  sprite.userData.tier = "gold";
  sprite.renderOrder = 8;
  ringGroup.add(sprite);
}

const starGeometry = new THREE.BufferGeometry();
const starCount = 3200;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starRng = mulberry32(456060);
for (let i = 0; i < starCount; i += 1) {
  const radius = 34 + starRng() * 50;
  const theta = starRng() * Math.PI * 2;
  const phi = Math.acos(2 * starRng() - 1);
  starPositions[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * radius;
  starPositions[i * 3 + 1] = Math.cos(phi) * radius;
  starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  const warm = starRng();
  starColors[i * 3 + 0] = 0.42 + warm * 0.3;
  starColors[i * 3 + 1] = 0.66 + warm * 0.28;
  starColors[i * 3 + 2] = 0.96 + warm * 0.04;
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
const starMaterial = new THREE.PointsMaterial({
  size: 0.044,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.28,
});
const stars = new THREE.Points(
  starGeometry,
  starMaterial,
);
scene.add(stars);

const colorAccentRings = [
  { inner: 3.05, outer: 3.16, color: 0xfff1c2, opacity: 0.12 },
  { inner: 4.0, outer: 4.12, color: 0xffbd4f, opacity: 0.14 },
  { inner: 5.0, outer: 5.14, color: 0x9fd6ff, opacity: 0.08 },
].map((accent) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(accent.inner, accent.outer, 256, 2),
    new THREE.MeshBasicMaterial({
      color: accent.color,
      transparent: true,
      opacity: accent.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  ringGroup.add(mesh);
  return mesh;
});

[
  { position: [5.8, 3.3, -12], scale: [18, 7.8, 1], rotation: -14, opacity: 0, color: [94, 202, 255], seed: 77 },
  { position: [-5.8, 1.0, -14], scale: [13, 6.4, 1], rotation: 18, opacity: 0, color: [190, 140, 255], seed: 88 },
  { position: [0.2, -3.2, -13], scale: [16, 6.0, 1], rotation: -4, opacity: 0, color: [255, 214, 132], seed: 96 },
].forEach((item) => {
  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: createNebulaTexture(item.seed, item.color),
      transparent: true,
      opacity: item.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  nebula.position.set(...item.position);
  nebula.scale.set(...item.scale);
  nebula.rotation.z = THREE.MathUtils.degToRad(item.rotation);
  scene.add(nebula);
});

function addBackgroundPlanet({ position, radius, colors, seed, ring = false }) {
  const planetObject = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({
      map: createSmallPlanetTexture(colors, seed),
      emissive: new THREE.Color(colors[1] ?? colors[0]),
      emissiveIntensity: 0.1,
      roughness: 0.66,
    }),
  );
  planetObject.add(body);
  if (ring) {
    const texture = createRingTexture(seed + 300, 0.9);
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.35, radius * 2.2, 96, 4),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.rotation.x = Math.PI / 2.35;
    mesh.rotation.z = THREE.MathUtils.degToRad(18);
    planetObject.add(mesh);
  }
  planetObject.position.set(...position);
  scene.add(planetObject);
  return planetObject;
}

const backgroundPlanets = [];

scene.add(new THREE.AmbientLight(0xd3c4ad, 2.05));
const keyLight = new THREE.PointLight(0xfff1d2, 42, 42);
keyLight.position.set(-3.8, 5.0, 5.8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xffdfb0, 14, 36);
rimLight.position.set(6.2, 2.6, 3.8);
scene.add(rimLight);
const ringFillLight = new THREE.PointLight(0xffe1a8, 8.5, 24);
ringFillLight.position.set(0.4, -2.2, 4.8);
scene.add(ringFillLight);
const frontSoftLight = new THREE.PointLight(0xffedd0, 16, 26);
frontSoftLight.position.set(1.8, 0.9, 6.4);
scene.add(frontSoftLight);

let speed = 1;
let targetYaw = 0;
let targetPitch = THREE.MathUtils.degToRad(-4);
let currentYaw = targetYaw;
let currentPitch = targetPitch;
let zoomDistance = 1;
let isDragging = false;
let lastPointer = { x: 0, y: 0 };
let dragVelocity = { x: 0, y: 0 };
let pointerStart = { x: 0, y: 0 };
let pointerMoved = false;

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.18;
const pointer = new THREE.Vector2();

function navigateHome() {
  window.location.hash = "";
  renderRoute();
}

function navigateAlbum() {
  window.location.hash = "album";
}

function navigateMusic() {
  window.location.hash = "music";
}

function assignPhotoEntriesByRank() {
  const tieredPhotos = getTieredPhotos();
  foregroundSparks.forEach((item, index) => {
    const photo = tieredPhotos.gold[index];
    if (!photo) return;
    item.photoId = photo.id;
    item.sprite.userData.photoId = photo.id;
  });
  brightStarMeta.forEach((meta, index) => {
    const photo = tieredPhotos.silver[index];
    if (photo) meta.photoId = photo.id;
  });
  particleMeta.forEach((meta, index) => {
    const photo = tieredPhotos.dust[index];
    meta.photoId = photo?.id ?? null;
    setParticleColor(index, photo, meta.tone);
    setPhotoDustColor(index, photo, meta.tone);
    if (!photo) hidePhotoDust(index);
  });
  particleGeometry.attributes.color.needsUpdate = true;
  photoDustGeometry.attributes.color.needsUpdate = true;
  photoDustGeometry.attributes.position.needsUpdate = true;
}

function navigatePhoto(photoId, increment = false) {
  const photo = photosById.get(photoId);
  if (!photo) return;
  if (increment) {
    requestJson(`/api/photos/${photoId}/view`, { method: "POST" })
      .then(({ state }) => mergeServerState(state))
      .catch(() => {
        photo.clickCount += 1;
        assignPhotoEntriesByRank();
        saveState();
      });
  }
  window.location.hash = `photo/${photoId}`;
  renderRoute();
}

function addUploadedPhoto(src, name = "", account = "") {
  const photo = {
    id: nextPhotoId,
    src,
    clickCount: 0,
    name,
    uploaderAccount: String(account).trim(),
  };
  nextPhotoId += 1;
  photos.push(photo);
  photosById.set(photo.id, photo);
  logActivity("upload", account, photo.id, name);
  assignPhotoEntriesByRank();
  saveState();
  return photo;
}

function replacePhoto(photoId, src, name = "", account = "") {
  const photo = photosById.get(photoId);
  if (!photo) return null;
  photo.src = src;
  photo.name = name;
  photo.clickCount = 0;
  photo.replacedBy = String(account).trim();
  logActivity("replace", account, photo.id, name);
  assignPhotoEntriesByRank();
  saveState();
  return photo;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function createDefaultMusicDataUrl() {
  const sampleRate = 22050;
  const seconds = 9;
  const samples = sampleRate * seconds;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples * bytesPerSample);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * bytesPerSample, true);
  const notes = [196, 246.94, 293.66, 369.99];
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 1.6, (seconds - t) / 1.8);
    const shimmer = Math.sin(Math.PI * 2 * (880 + Math.sin(t * 0.33) * 22) * t) * 0.05;
    const chord = notes.reduce((sum, freq, index) => {
      const drift = Math.sin(t * (0.11 + index * 0.03)) * 1.8;
      return sum + Math.sin(Math.PI * 2 * (freq + drift) * t) * (0.13 - index * 0.015);
    }, 0);
    const wave = (chord + shimmer) * envelope * 0.46;
    view.setInt16(44 + i * bytesPerSample, Math.max(-1, Math.min(1, wave)) * 32767, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

musicAudio.src = storedMusicSrc || createDefaultMusicDataUrl();

let ambientContext = null;
let ambientGain = null;
let ambientOscillators = [];
let synthMusicPlaying = false;
let musicWanted = false;

function startAmbientSynth() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  stopAmbientSynth();
  ambientContext = new AudioContextClass();
  ambientGain = ambientContext.createGain();
  ambientGain.gain.setValueAtTime(0.0001, ambientContext.currentTime);
  ambientGain.gain.exponentialRampToValueAtTime(0.055, ambientContext.currentTime + 1.2);
  ambientGain.connect(ambientContext.destination);
  [196, 246.94, 293.66, 392].forEach((frequency, index) => {
    const oscillator = ambientContext.createOscillator();
    const gain = ambientContext.createGain();
    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, ambientContext.currentTime);
    oscillator.detune.setValueAtTime((index - 1.5) * 4, ambientContext.currentTime);
    gain.gain.setValueAtTime(0.16 - index * 0.018, ambientContext.currentTime);
    oscillator.connect(gain).connect(ambientGain);
    oscillator.start();
    ambientOscillators.push(oscillator);
  });
  synthMusicPlaying = true;
  musicStar.classList.add("playing");
  return true;
}

function stopAmbientSynth() {
  if (ambientGain && ambientContext) {
    try {
      ambientGain.gain.cancelScheduledValues(ambientContext.currentTime);
      ambientGain.gain.setValueAtTime(Math.max(ambientGain.gain.value, 0.0001), ambientContext.currentTime);
      ambientGain.gain.exponentialRampToValueAtTime(0.0001, ambientContext.currentTime + 0.2);
    } catch {
      // Ignore teardown timing errors from closed audio contexts.
    }
  }
  ambientOscillators.forEach((oscillator) => {
    try {
      oscillator.stop((ambientContext?.currentTime ?? 0) + 0.22);
    } catch {
      // Oscillators may already be stopped.
    }
  });
  ambientOscillators = [];
  synthMusicPlaying = false;
}

async function toggleMusicPlayback() {
  if (!musicAudio.paused || synthMusicPlaying) {
    musicWanted = false;
    musicAudio.pause();
    stopAmbientSynth();
    musicStar.classList.remove("playing");
    return;
  }
  musicWanted = true;
  await ensureMusicPlayback();
}

async function ensureMusicPlayback() {
  if (!musicWanted || !musicAudio.paused || synthMusicPlaying) return;
  try {
    await musicAudio.play();
    stopAmbientSynth();
  } catch {
    startAmbientSynth();
  }
  if (!musicAudio.paused || synthMusicPlaying) {
    musicStar.classList.add("playing");
  } else {
    musicStar.classList.remove("playing");
  }
}

function renderMusicPage() {
  const musicPlaying = !musicAudio.paused || synthMusicPlaying;
  routePanel.hidden = false;
  routePanel.innerHTML = `
    <article class="music-page">
      <button class="panel-close" data-route="home" aria-label="返回星图">×</button>
      <div class="panel-kicker">MUSIC STAR</div>
      <h2>背景音乐</h2>
      <div class="music-controls">
        <button data-music-action="toggle">${musicPlaying ? "暂停音乐" : "播放音乐"}</button>
        <button data-route="home">返回星图</button>
      </div>
      <div class="music-upload">
        <div>
          <strong>上传音乐</strong>
          <span>当前音乐：${musicName}</span>
        </div>
        <input class="account-field" data-music-account type="text" inputmode="numeric" placeholder="输入上传账号" aria-label="输入上传账号" />
        <label class="upload-button">
          选择音乐
          <input data-music-upload type="file" accept="audio/*" />
        </label>
        <output class="music-status" data-music-status></output>
      </div>
    </article>
  `;
}

function renderRecords() {
  if (!activityLogs.length) {
    return `<div class="records-empty">暂无上传或更换记录。</div>`;
  }
  return `
    <div class="records-list">
      ${activityLogs
        .map(
          (record) => `
            <div class="record-item">
              <strong>${
                record.type === "music"
                  ? "上传音乐"
                  : `${record.type === "upload" ? "上传" : "更换"}照片 #${record.photoId}`
              }</strong>
              <span>账号 ${record.account}</span>
              <span>${record.time}</span>
              <span>${record.fileName || "未命名文件"}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPhotoPage(photo) {
  const tier = photoTierLabel(photo);
  routePanel.hidden = false;
  routePanel.innerHTML = `
    <article class="photo-page">
      <button class="panel-close" data-route="album" aria-label="返回相册">×</button>
      <div class="panel-kicker">${tier}</div>
      <h2>照片 #${photo.id}</h2>
      <img class="photo-preview" src="${photo.src}" alt="毕业照片 ${photo.id}" />
      <div class="photo-meta">
        <span>永久编号 ${photo.id}</span>
        <span>浏览量 ${photo.clickCount}</span>
      </div>
      <div class="replace-photo">
        <div>
          <strong>更换照片</strong>
          <span>更换后保留编号 #${photo.id}，浏览量从 0 重新记录。</span>
        </div>
        <input class="account-field" data-replace-account type="text" inputmode="numeric" placeholder="输入上传账号" aria-label="输入上传账号" />
        <label class="upload-button">
          选择新照片
          <input data-replace-input data-photo-id="${photo.id}" type="file" accept="image/*" />
        </label>
        <button data-replace-confirm data-photo-id="${photo.id}" type="button">确认替换</button>
        <output class="replace-status" data-replace-status></output>
      </div>
      <button class="panel-action" data-route="album">返回相册</button>
    </article>
  `;
}

function renderPhotoViewer(photo) {
  routePanel.hidden = false;
  routePanel.innerHTML = `
    <article class="photo-viewer-page">
      <button class="panel-close" data-route="photo/${photo.id}" aria-label="返回照片">×</button>
      <div class="viewer-toolbar">
        <span>照片 #${photo.id}</span>
        <a class="download-button" href="${photo.src}" download="graduation-photo-${photo.id}.jpg">下载照片</a>
      </div>
      <img class="photo-original" src="${photo.src}" alt="照片 ${photo.id}" />
    </article>
  `;
}

function renderAlbumPage() {
  const ranked = getRankedPhotos().slice(0, 10);
  routePanel.hidden = false;
  routePanel.innerHTML = `
    <article class="album-page">
      <button class="panel-close" data-route="home" aria-label="返回星图">×</button>
      <div class="panel-kicker">TOP 10</div>
      <h2>相册主页</h2>
      <form class="album-search" data-search-form>
        <input name="photoId" type="number" min="1" step="1" placeholder="输入照片编号" aria-label="输入照片编号" />
        <button type="submit">查看照片</button>
      </form>
      <div class="album-upload">
        <div>
          <strong>上传照片</strong>
          <span>新照片将获得永久编号 #${nextPhotoId}</span>
        </div>
        <input class="account-field" data-upload-account type="text" inputmode="numeric" placeholder="输入上传账号" aria-label="输入上传账号" />
        <label class="upload-button">
          选择照片
          <input data-upload-input type="file" accept="image/*" multiple />
        </label>
        <output class="upload-status" data-upload-status></output>
      </div>
      <form class="records-access" data-records-form>
        <input name="accessCode" type="password" placeholder="输入留痕查看码" aria-label="输入留痕查看码" />
        <button type="submit">查看记录</button>
      </form>
      <div class="records-output" data-records-output></div>
      <button class="panel-action" data-route="gallery">进入图库</button>
      <div class="album-grid">
        ${ranked
          .map(
            (photo) => `
              <button class="album-card" data-photo-id="${photo.id}">
                <img src="${photo.src}" alt="照片 ${photo.id}" />
                <span>#${photo.id} · ${photo.clickCount}</span>
              </button>
            `,
          )
          .join("")}
      </div>
      <button class="panel-action" data-route="home">返回星图</button>
    </article>
  `;
}


function renderGalleryPage() {
  const galleryPhotos = [...photos].sort((a, b) => a.id - b.id);
  routePanel.hidden = false;
  routePanel.innerHTML = `
    <article class="album-page">
      <button class="panel-close" data-route="album" aria-label="返回相册">×</button>
      <div class="panel-kicker">GALLERY</div>
      <h2>图库</h2>
      <div class="album-grid">
        ${galleryPhotos
          .map(
            (photo) => `
              <button class="album-card" data-photo-id="${photo.id}">
                <img src="${photo.src}" alt="照片 ${photo.id}" />
                <span>#${photo.id} · ${photo.clickCount}</span>
              </button>
            `,
          )
          .join("")}
      </div>
      <button class="panel-action" data-route="album">返回相册</button>
    </article>
  `;
}
function renderRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    routePanel.hidden = true;
    routePanel.innerHTML = "";
    return;
  }
  if (hash === "album") {
    renderAlbumPage();
    return;
  }
  if (hash === "gallery") {
    renderGalleryPage();
    return;
  }
  if (hash === "music") {
    renderMusicPage();
    return;
  }
  const viewMatch = hash.match(/^photo\/(\d+)\/view$/);
  if (viewMatch) {
    const photo = photosById.get(Number(viewMatch[1]));
    if (photo) renderPhotoViewer(photo);
    return;
  }
  const match = hash.match(/^photo\/(\d+)$/);
  if (match) {
    const photo = photosById.get(Number(match[1]));
    if (photo) renderPhotoPage(photo);
    return;
  }
  routePanel.hidden = true;
}

routePanel.addEventListener("click", (event) => {
  const previewImage = event.target.closest(".photo-preview");
  if (previewImage) {
    const match = window.location.hash.match(/^#photo\/(\d+)$/);
    if (match) window.location.hash = `photo/${match[1]}/view`;
    return;
  }
  const routeButton = event.target.closest("[data-route]");
  if (routeButton?.dataset.route === "home") {
    navigateHome();
    return;
  }
  if (routeButton?.dataset.route === "album") {
    navigateAlbum();
    return;
  }
  if (routeButton?.dataset.route) {
    window.location.hash = routeButton.dataset.route;
    renderRoute();
    return;
  }
  const musicButton = event.target.closest("[data-music-action]");
  if (musicButton?.dataset.musicAction === "toggle") {
    toggleMusicPlayback().finally(() => {
      if (window.location.hash.replace(/^#/, "") === "music") renderMusicPage();
    });
    return;
  }
  const replaceButton = event.target.closest("[data-replace-confirm]");
  if (replaceButton) {
    const photoId = Number(replaceButton.dataset.photoId);
    const pending = pendingPhotoReplacements.get(photoId);
    const status = routePanel.querySelector("[data-replace-status]");
    const accountInput = routePanel.querySelector("[data-replace-account]");
    const account = accountInput?.value ?? "";
    if (!isAuthorizedAccount(account)) {
      if (status) status.textContent = "账号无权限更换照片";
      accountInput?.focus();
      return;
    }
    if (!pending) {
      if (status) status.textContent = "请先选择新照片";
      return;
    }
    if (status) status.textContent = "更换中...";
    const formData = new FormData();
    formData.append("account", account);
    formData.append("photo", pending.file);
    requestJson(`/api/photos/${photoId}`, {
      method: "PUT",
      body: formData,
    })
      .then(({ state }) => {
        pendingPhotoReplacements.delete(photoId);
        mergeServerState(state);
        renderPhotoPage(photosById.get(photoId));
        const nextStatus = routePanel.querySelector("[data-replace-status]");
        if (nextStatus) nextStatus.textContent = `已更换照片 #${photoId}，浏览量已清零`;
      })
      .catch(() => {
        if (isSharedBackendConfigured) {
          const nextStatus = routePanel.querySelector("[data-replace-status]");
          if (nextStatus) nextStatus.textContent = "云端更换失败，请稍后重试；这次不会当作正式更换";
          return;
        }
        const photo = replacePhoto(photoId, pending.src, pending.name, account);
        pendingPhotoReplacements.delete(photoId);
        if (!photo) return;
        renderPhotoPage(photo);
        const nextStatus = routePanel.querySelector("[data-replace-status]");
        if (nextStatus) nextStatus.textContent = `已更换照片 #${photo.id}，浏览量已清零（本地保存）`;
      });
    return;
  }
  const photoButton = event.target.closest(".album-card[data-photo-id]");
  if (photoButton) {
    navigatePhoto(Number(photoButton.dataset.photoId), true);
  }
});

routePanel.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-search-form]");
  if (form) {
    event.preventDefault();
    const input = form.elements.photoId;
    const photoId = Number(input.value);
    if (photosById.has(photoId)) {
      navigatePhoto(photoId, true);
      return;
    }
    input.setCustomValidity("没有找到这个编号的照片");
    input.reportValidity();
    input.setCustomValidity("");
    return;
  }
  const recordsForm = event.target.closest("[data-records-form]");
  if (recordsForm) {
    event.preventDefault();
    const input = recordsForm.elements.accessCode;
    const output = routePanel.querySelector("[data-records-output]");
    if (input.value === RECORDS_ACCESS_CODE) {
      requestJson(`/api/records?code=${encodeURIComponent(input.value)}`)
        .then(({ activityLogs: logs }) => {
          activityLogs.splice(0, activityLogs.length, ...(Array.isArray(logs) ? logs : []));
          if (output) output.innerHTML = renderRecords();
        })
        .catch(() => {
          if (output) output.innerHTML = renderRecords();
        });
      return;
    }
    input.setCustomValidity("查看码不正确");
    input.reportValidity();
    input.setCustomValidity("");
  }
});

routePanel.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-upload-input]");
  if (!input?.files?.length) return;
  const status = routePanel.querySelector("[data-upload-status]");
  const accountInput = routePanel.querySelector("[data-upload-account]");
  const account = accountInput?.value ?? "";
  if (!isAuthorizedAccount(account)) {
    if (status) status.textContent = "账号无权限上传";
    accountInput?.focus();
    input.value = "";
    return;
  }
  const files = [...input.files].filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    if (status) status.textContent = "请选择图片文件";
    return;
  }
  if (status) status.textContent = "上传中...";
  const formData = new FormData();
  formData.append("account", account);
  files.forEach((file) => formData.append("photos", file));
  try {
    const { added, state } = await requestJson("/api/photos", {
      method: "POST",
      body: formData,
    });
    mergeServerState(state);
    const nextStatus = routePanel.querySelector("[data-upload-status]");
    if (nextStatus) {
      nextStatus.textContent = `已上传 ${added.length} 张：${added.map((photo) => `#${photo.id}`).join("、")}`;
    }
    return;
  } catch (error) {
    if (isSharedBackendConfigured) {
      const nextStatus = routePanel.querySelector("[data-upload-status]");
      if (nextStatus) nextStatus.textContent = `云端保存失败：${error.message || "请稍后重试"}`;
      return;
    }
    const added = [];
    for (const file of files) {
      const src = await readImageFile(file);
      added.push(addUploadedPhoto(src, file.name, account));
    }
    renderAlbumPage();
    const nextStatus = routePanel.querySelector("[data-upload-status]");
    if (nextStatus) {
      nextStatus.textContent = `已上传 ${added.length} 张：${added.map((photo) => `#${photo.id}`).join("、")}（本地保存）`;
    }
  }
});

routePanel.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-replace-input]");
  const file = input?.files?.[0];
  if (!file) return;
  const status = routePanel.querySelector("[data-replace-status]");
  const photoId = Number(input.dataset.photoId);
  if (!file.type.startsWith("image/")) {
    if (status) status.textContent = "请选择图片文件";
    input.value = "";
    pendingPhotoReplacements.delete(photoId);
    return;
  }
  if (status) status.textContent = "读取新照片中...";
  const src = await readImageFile(file);
  pendingPhotoReplacements.set(photoId, { src, name: file.name, file });
  if (status) status.textContent = `已选择：${file.name}，请点击确认替换`;
});

routePanel.addEventListener("change", (event) => {
  const input = event.target.closest("[data-music-upload]");
  const file = input?.files?.[0];
  if (!file) return;
  const status = routePanel.querySelector("[data-music-status]");
  const accountInput = routePanel.querySelector("[data-music-account]");
  const account = accountInput?.value ?? "";
  if (!isAuthorizedAccount(account)) {
    if (status) status.textContent = "账号无权限上传音乐";
    accountInput?.focus();
    input.value = "";
    return;
  }
  if (status) status.textContent = "上传音乐中...";
  stopAmbientSynth();
  const formData = new FormData();
  formData.append("account", account);
  formData.append("music", file);
  requestJson("/api/music", {
    method: "POST",
    body: formData,
  })
    .then(({ state }) => {
      mergeServerState(state);
      if (status) status.textContent = `已上传：${file.name}`;
      toggleMusicPlayback().finally(() => {
        if (window.location.hash.replace(/^#/, "") === "music") renderMusicPage();
      });
    })
    .catch(() => {
      readImageFile(file).then((src) => {
        if (currentMusicObjectUrl) URL.revokeObjectURL(currentMusicObjectUrl);
        currentMusicObjectUrl = "";
        storedMusicSrc = src;
        musicName = file.name;
        musicAudio.src = storedMusicSrc;
        musicAudio.load();
        logActivity("music", account, "", file.name);
        saveState();
        if (status) status.textContent = `已上传：${file.name}（本地保存）`;
        toggleMusicPlayback().finally(() => {
          if (window.location.hash.replace(/^#/, "") === "music") renderMusicPage();
        });
      });
    });
});

musicStar.addEventListener("click", () => {
  toggleMusicPlayback().catch(() => {});
});

musicStar.addEventListener("dblclick", () => {
  navigateMusic();
});

musicAudio.addEventListener("play", () => musicStar.classList.add("playing"));
musicAudio.addEventListener("pause", () => {
  if (musicWanted) {
    setTimeout(() => ensureMusicPlayback().catch(() => {}), 120);
    return;
  }
  musicStar.classList.remove("playing");
});
window.addEventListener("hashchange", renderRoute);
renderRoute();
loadSharedState();

document.querySelectorAll(".speed-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".speed-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    speed = Number(button.dataset.speed);
  });
});

canvas.addEventListener("pointerdown", (event) => {
  isDragging = true;
  canvas.setPointerCapture(event.pointerId);
  lastPointer = { x: event.clientX, y: event.clientY };
  pointerStart = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  dragVelocity = { x: 0, y: 0 };
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
    pointerMoved = true;
  }
  lastPointer = { x: event.clientX, y: event.clientY };
  dragVelocity = { x: dx, y: dy };
  targetYaw += dx * 0.013;
  targetPitch = THREE.MathUtils.clamp(
    targetPitch + dy * 0.008,
    THREE.MathUtils.degToRad(-70),
    THREE.MathUtils.degToRad(62),
  );
});

function stopDrag(event) {
  if (!isDragging) return;
  isDragging = false;
  if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerup", stopDrag);
canvas.addEventListener("pointercancel", stopDrag);
canvas.addEventListener("click", (event) => {
  if (pointerMoved || routePanel.hidden === false) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  const sparkHits = raycaster.intersectObjects(foregroundSparks.map((item) => item.sprite), false);
  const sparkHit = sparkHits.find((hit) => hit.object.visible && hit.object.material.opacity > 0.08);
  if (sparkHit?.object.userData.photoId) {
    navigatePhoto(sparkHit.object.userData.photoId, true);
    return;
  }

  const silverHit = raycaster.intersectObject(brightRingStars, false)[0];
  if (silverHit && silverHit.index !== undefined) {
    const meta = brightStarMeta[silverHit.index];
    if (meta?.frontVisibility > 0.18) {
      navigatePhoto(meta.photoId, true);
      return;
    }
  }

  const photoDustHit = raycaster.intersectObject(photoDustPoints, false)[0];
  if (photoDustHit && photoDustHit.index !== undefined) {
    const meta = particleMeta[photoDustHit.index];
    if (meta?.photoId && meta.frontVisibility > 0.12) {
      navigatePhoto(meta.photoId, true);
      return;
    }
  }

  const dustHit = raycaster.intersectObject(ringParticles, false)[0];
  if (dustHit && dustHit.index !== undefined) {
    const meta = particleMeta[dustHit.index];
    if (meta?.photoId && meta.frontVisibility > 0.14) {
      navigatePhoto(meta.photoId, true);
      return;
    }
  }

  const planetHit = raycaster.intersectObjects([referenceDomeFront, planet], false)[0];
  if (planetHit) navigateAlbum();
});
canvas.addEventListener("dblclick", () => {
  targetYaw = 0;
  targetPitch = THREE.MathUtils.degToRad(-4);
  zoomDistance = 1;
  dragVelocity = { x: 0, y: 0 };
});
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoomDistance = THREE.MathUtils.clamp(zoomDistance + event.deltaY * 0.0008, 0.72, 1.42);
  },
  { passive: false },
);

function updateCamera(width) {
  const mobile = width < 700;
  const basePosition = mobile ? new THREE.Vector3(0, 3.65, 12.6) : new THREE.Vector3(0, 3.8, 10.8);
  const baseLookAt = mobile ? new THREE.Vector3(0, -0.52, 0) : new THREE.Vector3(0, -0.48, 0);
  const offset = basePosition.sub(baseLookAt).multiplyScalar(zoomDistance);
  camera.position.copy(baseLookAt).add(offset);
  camera.lookAt(baseLookAt);
  root.scale.setScalar(mobile ? 0.88 : 1);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCamera(width);
}
window.addEventListener("resize", resize);
resize();

function updateRingParticles(elapsed) {
  for (let i = 0; i < particleCount; i += 1) {
    const meta = particleMeta[i];
    const angle = meta.angle + elapsed * meta.speed * speed;
    const radius = meta.radius + meta.laneOffset * Math.sin(meta.phase + elapsed * 0.4);
    meta.frontVisibility = THREE.MathUtils.smoothstep(Math.sin(angle), -0.16, 0.26);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = Math.sin(meta.phase + elapsed * 1.4) * meta.bob;
    particlePositions[i * 3 + 0] = x;
    particlePositions[i * 3 + 1] = y;
    particlePositions[i * 3 + 2] = z;
    if (meta.photoId && meta.frontVisibility > 0.12) {
      photoDustPositions[i * 3 + 0] = x;
      photoDustPositions[i * 3 + 1] = y;
      photoDustPositions[i * 3 + 2] = z + 0.012;
    } else {
      hidePhotoDust(i);
    }
  }
  particleGeometry.attributes.position.needsUpdate = true;
  photoDustGeometry.attributes.position.needsUpdate = true;

  for (let i = 0; i < brightStarCount; i += 1) {
    const meta = brightStarMeta[i];
    const angle = meta.angle + elapsed * meta.speed * speed;
    meta.frontVisibility = THREE.MathUtils.smoothstep(Math.sin(angle), -0.12, 0.3);
    brightStarPositions[i * 3 + 0] = Math.cos(angle) * meta.radius;
    brightStarPositions[i * 3 + 1] = Math.sin(angle) * meta.radius;
    brightStarPositions[i * 3 + 2] = Math.sin(meta.phase + elapsed * 1.2) * meta.bob;
  }
  brightStarGeometry.attributes.position.needsUpdate = true;

  foregroundSparks.forEach((item) => {
    const angle = item.angle + elapsed * item.speed * speed;
    const frontVisibility = THREE.MathUtils.smoothstep(Math.sin(angle), 0.08, 0.36);
    item.sprite.position.set(
      Math.cos(angle) * item.radius,
      Math.sin(angle) * item.radius,
      0.035 + Math.sin(item.phase + elapsed * 1.1) * 0.018,
    );
    const pulse = 1 + Math.sin(elapsed * 2.6 + item.phase) * 0.18;
    item.sprite.scale.setScalar(item.baseScale * pulse);
    item.sprite.material.opacity = (0.88 + Math.sin(elapsed * 2 + item.phase) * 0.1) * frontVisibility;
    item.sprite.visible = frontVisibility > 0.08;
  });
}

const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();
  if (!isDragging) {
    targetYaw += dragVelocity.x * 0.00028;
    targetPitch = THREE.MathUtils.clamp(
      targetPitch + dragVelocity.y * 0.00016,
      THREE.MathUtils.degToRad(-70),
      THREE.MathUtils.degToRad(62),
    );
    dragVelocity.x *= 0.92;
    dragVelocity.y *= 0.92;
  }
  currentYaw += (targetYaw - currentYaw) * 0.13;
  currentPitch += (targetPitch - currentPitch) * 0.13;
  orbitPivot.rotation.set(currentPitch, currentYaw, 0, "YXZ");
  updateCamera(window.innerWidth);
  updateRingParticles(elapsed);
  ringTexture.offset.x = (elapsed * 0.022 * speed) % 1;
  ringLanes.forEach((lane) => {
    lane.texture.offset.x = (elapsed * lane.speed * speed) % 1;
  });
  planet.rotation.y = elapsed * 0.05;
  planetLights.rotation.y = planet.rotation.y;
  backgroundPlanets.forEach((item, index) => {
    item.rotation.y = elapsed * (0.05 + index * 0.018);
  });
  stars.rotation.y = elapsed * 0.0025;
  stars.rotation.x = Math.sin(elapsed * 0.05) * 0.015;
  starMaterial.opacity = 0.22 + Math.sin(elapsed * 1.45) * 0.045 + Math.sin(elapsed * 3.1) * 0.018;
  starMaterial.size = 0.034 + Math.sin(elapsed * 2.35) * 0.004;
  brightStarMaterial.opacity = 0.9 + Math.sin(elapsed * 1.7) * 0.08;
  brightStarMaterial.size = 0.16 + Math.sin(elapsed * 2.1) * 0.018;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

