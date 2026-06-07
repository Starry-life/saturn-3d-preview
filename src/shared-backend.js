import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PHOTO_BUCKET = import.meta.env.VITE_SUPABASE_PHOTO_BUCKET || "graduation-photos";
const MUSIC_BUCKET = import.meta.env.VITE_SUPABASE_MUSIC_BUCKET || "graduation-music";
const RECORDS_ACCESS_CODE = "5708481";

export const isSharedBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = isSharedBackendConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function assertConfigured() {
  if (!supabase) throw new Error("Supabase is not configured.");
}

function isAuthorizedAccount(account) {
  const value = Number(String(account).trim());
  return (
    Number.isInteger(value) &&
    ((value >= 202324002001 && value <= 202324002090) ||
      (value >= 202324001001 && value <= 202324001050))
  );
}

function defaultClickCount(id) {
  if (id <= 10) return 3;
  if (id <= 30) return 2;
  return 1;
}

function safeFileName(fileName) {
  const cleaned = String(fileName || "upload")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-90);
  return cleaned || "upload";
}

function makePath(folder, file) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${folder}/${Date.now()}-${random}-${safeFileName(file.name)}`;
}

function publicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function normalizePhoto(photo) {
  return {
    id: Number(photo.id),
    src: photo.src || "",
    clickCount: Number(photo.click_count ?? photo.clickCount ?? 0),
    name: photo.name || "",
    uploaderAccount: photo.uploader_account || photo.uploaderAccount || "",
    replacedBy: photo.replaced_by || photo.replacedBy || "",
  };
}

function normalizeLog(log) {
  return {
    type: log.type,
    account: log.account || "",
    photoId: log.photo_id ?? "",
    fileName: log.file_name || "",
    time: log.created_at ? new Date(log.created_at).toLocaleString("zh-CN", { hour12: false }) : "",
  };
}

async function uploadPublicFile(bucket, folder, file) {
  const path = makePath(folder, file);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return publicUrl(bucket, path);
}

async function insertLog(type, account, photoId = null, fileName = "") {
  const { error } = await supabase.from("activity_logs").insert({
    type,
    account: String(account).trim(),
    photo_id: photoId || null,
    file_name: fileName,
  });
  if (error) console.warn("Failed to write activity log", error);
}

async function getSettings() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["music"]);
  if (error) throw error;
  const settings = Object.fromEntries((data || []).map((item) => [item.key, item.value || {}]));
  return settings;
}

export async function getSharedState() {
  assertConfigured();
  const [{ data: photoRows, error: photosError }, settings] = await Promise.all([
    supabase.from("photos").select("*").order("id", { ascending: true }),
    getSettings(),
  ]);
  if (photosError) throw photosError;
  const photos = (photoRows || []).map(normalizePhoto);
  const maxId = photos.reduce((max, photo) => Math.max(max, photo.id), 100);
  const music = settings.music || {};
  return {
    photos,
    musicName: music.musicName || "星河默认氛围",
    musicSrc: music.musicSrc || "",
    nextPhotoId: Math.max(maxId + 1, 101),
  };
}

export async function getActivityLogs(code) {
  assertConfigured();
  if (String(code) !== RECORDS_ACCESS_CODE) throw new Error("查看码不正确");
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return { activityLogs: (data || []).map(normalizeLog) };
}

export async function uploadPhotos(account, files) {
  assertConfigured();
  if (!isAuthorizedAccount(account)) throw new Error("账号无权限上传");
  const added = [];
  for (const file of files) {
    const src = await uploadPublicFile(PHOTO_BUCKET, "photos", file);
    const { data, error } = await supabase
      .from("photos")
      .insert({
        src,
        click_count: 0,
        name: file.name,
        uploader_account: String(account).trim(),
      })
      .select()
      .single();
    if (error) throw error;
    await insertLog("upload", account, data.id, file.name);
    added.push(normalizePhoto(data));
  }
  return { added, state: await getSharedState() };
}

export async function replaceSharedPhoto(photoId, account, file) {
  assertConfigured();
  if (!isAuthorizedAccount(account)) throw new Error("账号无权限更换照片");
  const id = Number(photoId);
  const src = await uploadPublicFile(PHOTO_BUCKET, "photos", file);
  const { error } = await supabase.from("photos").upsert(
    {
      id,
      src,
      click_count: 0,
      name: file.name,
      replaced_by: String(account).trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  await insertLog("replace", account, id, file.name);
  return { state: await getSharedState() };
}

export async function incrementSharedPhotoView(photoId) {
  assertConfigured();
  const id = Number(photoId);
  const { data: current, error: selectError } = await supabase
    .from("photos")
    .select("id,src,click_count,name,uploader_account,replaced_by")
    .eq("id", id)
    .maybeSingle();
  if (selectError) throw selectError;

  const nextCount = Number(current?.click_count ?? defaultClickCount(id)) + 1;
  const { error } = await supabase.from("photos").upsert(
    {
      id,
      src: current?.src || "",
      click_count: nextCount,
      name: current?.name || "",
      uploader_account: current?.uploader_account || "",
      replaced_by: current?.replaced_by || "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return { state: await getSharedState() };
}

export async function uploadMusic(account, file) {
  assertConfigured();
  if (!isAuthorizedAccount(account)) throw new Error("账号无权限上传音乐");
  const musicSrc = await uploadPublicFile(MUSIC_BUCKET, "music", file);
  const value = { musicName: file.name, musicSrc };
  const { error } = await supabase.from("app_settings").upsert(
    { key: "music", value, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw error;
  await insertLog("music", account, null, file.name);
  return { state: await getSharedState() };
}

export async function handleSharedRequest(url, options = {}) {
  if (!isSharedBackendConfigured) return null;
  const method = String(options.method || "GET").toUpperCase();
  const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
  const query = url.includes("?") ? new URL(url, window.location.origin).searchParams : new URLSearchParams();

  if (method === "GET" && path === "/api/state") return getSharedState();
  if (method === "GET" && path === "/api/records") return getActivityLogs(query.get("code"));

  const photoViewMatch = path.match(/^\/api\/photos\/(\d+)\/view$/);
  if (method === "POST" && photoViewMatch) return incrementSharedPhotoView(Number(photoViewMatch[1]));

  const photoReplaceMatch = path.match(/^\/api\/photos\/(\d+)$/);
  if (method === "PUT" && photoReplaceMatch) {
    const body = options.body;
    return replaceSharedPhoto(Number(photoReplaceMatch[1]), body.get("account"), body.get("photo"));
  }

  if (method === "POST" && path === "/api/photos") {
    const body = options.body;
    return uploadPhotos(body.get("account"), body.getAll("photos"));
  }

  if (method === "POST" && path === "/api/music") {
    const body = options.body;
    return uploadMusic(body.get("account"), body.get("music"));
  }

  return null;
}
