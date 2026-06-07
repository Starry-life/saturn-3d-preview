import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3001);
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
const photoUploadDir = path.join(uploadDir, "photos");
const musicUploadDir = path.join(uploadDir, "music");
const statePath = path.join(dataDir, "state.json");
const recordsAccessCode = "5708481";

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function isAuthorizedAccount(account) {
  const value = Number(String(account).trim());
  return (
    Number.isInteger(value) &&
    ((value >= 202324002001 && value <= 202324002090) ||
      (value >= 202324001001 && value <= 202324001050))
  );
}

async function ensureStorage() {
  await fs.mkdir(photoUploadDir, { recursive: true });
  await fs.mkdir(musicUploadDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
}

async function readState() {
  await ensureStorage();
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return {
      photos: [],
      activityLogs: [],
      musicName: "星河默认氛围",
      musicSrc: "",
    };
  }
}

async function writeState(state) {
  await ensureStorage();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function publicUploadPath(filePath) {
  return `/${path.relative(__dirname, filePath).replaceAll(path.sep, "/")}`;
}

function nextPhotoId(photos) {
  return Math.max(100, ...photos.map((photo) => Number(photo.id) || 0)) + 1;
}

function logActivity(state, type, account, photoId, fileName = "") {
  state.activityLogs.unshift({
    type,
    account: String(account).trim(),
    photoId,
    fileName,
    time: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, req.uploadKind === "music" ? musicUploadDir : photoUploadDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname) || "";
      const base = path.basename(file.originalname, ext).replace(/[^\w.-]+/g, "_").slice(0, 48);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
    },
  }),
});

function musicUploadKind(req, _res, next) {
  req.uploadKind = "music";
  next();
}

app.use("/uploads", express.static(uploadDir));

app.get("/api/state", async (_req, res) => {
  const state = await readState();
  res.json({
    photos: state.photos,
    musicName: state.musicName,
    musicSrc: state.musicSrc,
    nextPhotoId: nextPhotoId(state.photos),
  });
});

app.get("/api/records", async (req, res) => {
  if (String(req.query.code || "") !== recordsAccessCode) {
    res.status(403).json({ error: "查看码不正确" });
    return;
  }
  const state = await readState();
  res.json({ activityLogs: state.activityLogs });
});

app.post("/api/photos", upload.array("photos", 20), async (req, res) => {
  const account = req.body.account;
  if (!isAuthorizedAccount(account)) {
    res.status(403).json({ error: "账号无权限上传" });
    return;
  }
  const files = req.files || [];
  if (!files.length) {
    res.status(400).json({ error: "请选择图片文件" });
    return;
  }
  const state = await readState();
  const added = files.map((file, index) => {
    const id = nextPhotoId(state.photos) + index;
    const photo = {
      id,
      src: publicUploadPath(file.path),
      clickCount: 0,
      name: file.originalname,
      uploaderAccount: String(account).trim(),
    };
    logActivity(state, "upload", account, id, file.originalname);
    return photo;
  });
  state.photos.push(...added);
  await writeState(state);
  res.json({ added, state });
});

app.put("/api/photos/:id", upload.single("photo"), async (req, res) => {
  const account = req.body.account;
  if (!isAuthorizedAccount(account)) {
    res.status(403).json({ error: "账号无权限更换照片" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "请选择图片文件" });
    return;
  }
  const id = Number(req.params.id);
  const state = await readState();
  const existing = state.photos.find((photo) => Number(photo.id) === id);
  if (existing) {
    existing.src = publicUploadPath(req.file.path);
    existing.clickCount = 0;
    existing.name = req.file.originalname;
    existing.replacedBy = String(account).trim();
  } else {
    state.photos.push({
      id,
      src: publicUploadPath(req.file.path),
      clickCount: 0,
      name: req.file.originalname,
      replacedBy: String(account).trim(),
    });
  }
  logActivity(state, "replace", account, id, req.file.originalname);
  await writeState(state);
  res.json({ state });
});

app.post("/api/photos/:id/view", async (req, res) => {
  const id = Number(req.params.id);
  const state = await readState();
  const existing = state.photos.find((photo) => Number(photo.id) === id);
  if (existing) {
    existing.clickCount = Number(existing.clickCount || 0) + 1;
  } else {
    state.photos.push({ id, clickCount: 1 });
  }
  await writeState(state);
  res.json({ state });
});

app.post("/api/music", musicUploadKind, upload.single("music"), async (req, res) => {
  const account = req.body.account;
  if (!isAuthorizedAccount(account)) {
    res.status(403).json({ error: "账号无权限上传音乐" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "请选择音乐文件" });
    return;
  }
  const state = await readState();
  state.musicName = req.file.originalname;
  state.musicSrc = publicUploadPath(req.file.path);
  logActivity(state, "music", account, "", req.file.originalname);
  await writeState(state);
  res.json({ state });
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Graduation star atlas server running at http://127.0.0.1:${port}`);
});
