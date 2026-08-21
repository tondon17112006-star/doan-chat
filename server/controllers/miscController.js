// File: server/controllers/miscController.js
import path from "node:path";
import { unlink } from "node:fs/promises";
import sharp from "sharp";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  adminStats,
  assertUploadQuota,
  canUserReadUpload,
  findPublicDemoUpload,
  findUploadByFilename,
  getSettings,
  registerUploads,
  searchEverything,
  updateSettings,
} from "../services/dataService.js";
import { audit } from "../services/auditService.js";
import { readinessStatus } from "../services/healthService.js";
import { safeOriginalName, validateUploadedFile } from "../middlewares/upload.js";
import { getStorageProvider, storageProviderName, uploadUrlFor } from "../services/storageProvider.js";
import { AppError } from "../utils/AppError.js";

export const uploadFiles = asyncHandler(async (request, response) => {
  const uploadedPaths = new Set((request.files || []).map((file) => file.path));
  try {
    await getStorageProvider().prepare();
    await assertUploadQuota(request.user.id, (request.files || []).reduce((total, file) => total + file.size, 0));
    const files = [];
    for (const file of request.files || []) {
      await validateUploadedFile(file);
      let filename = file.filename;
      let size = file.size;
      let mimeType = file.mimetype;
      if (file.mimetype.startsWith("image/") && file.mimetype !== "image/gif" && file.size > 500_000) {
        const target = file.path.replace(path.extname(file.path), ".webp");
        uploadedPaths.add(target);
        const result = await sharp(file.path).rotate().resize({ width: 2200, withoutEnlargement: true }).webp({ quality: 84 }).toFile(target);
        await unlink(file.path);
        uploadedPaths.delete(file.path);
        filename = path.basename(target);
        size = result.size;
        mimeType = "image/webp";
      }
      files.push({
        filename,
        storageKey: filename,
        storageProvider: storageProviderName(),
        originalName: safeOriginalName(file.originalname),
        mimeType,
        size,
      });
    }
    const purpose = ["attachment", "avatar", "story"].includes(request.query.purpose) ? request.query.purpose : "attachment";
    const records = await registerUploads(request.user.id, files, purpose);
    await audit(request, "upload", "file", null, { count: records.length, purpose });
    response.status(201).json({
      success: true,
      data: records.map((file) => ({
        id: file.id,
        name: file.originalName,
        type: file.mimeType,
        size: file.size,
        url: uploadUrlFor(file.storageKey || file.filename),
      })),
    });
  } catch (error) {
    await Promise.all([...uploadedPaths].map((filePath) => unlink(filePath).catch(() => undefined)));
    throw error;
  }
});

export const downloadUpload = asyncHandler(async (request, response) => {
  const file = await findUploadByFilename(request.params.filename);
  if (!file) throw new AppError("File not found.", 404);
  if (!(await canUserReadUpload(request.user.id, file.filename))) {
    throw new AppError("You do not have permission to access this file.", 403);
  }
  await sendStoredUpload(file, response, "private, max-age=0, must-revalidate");
});

export const servePublicDemoUpload = asyncHandler(async (request, response) => {
  const file = await findPublicDemoUpload(request.params.filename);
  if (!file) throw new AppError("File not found.", 404);
  await sendStoredUpload(file, response, "public, max-age=604800, immutable");
});

async function sendStoredUpload(file, response, cacheControl) {
  const provider = getStorageProvider(file.storageProvider || "local");
  const storageKey = file.storageKey || file.filename;
  if (!(await provider.exists(storageKey))) throw new AppError("File not found.", 404);
  response.set({
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${String(file.originalName || file.filename).replace(/["\\]/g, "_")}"`,
  });
  response.type(file.mimeType);
  provider.send(storageKey, response);
}

export const search = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await searchEverything(request.user.id, request.query.q) });
});

export const settings = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await getSettings(request.user.id) });
});

export const saveSettings = asyncHandler(async (request, response) => {
  response.json({ success: true, data: await updateSettings(request.user.id, request.body) });
});

export const dashboard = asyncHandler(async (_request, response) => {
  response.json({ success: true, data: await adminStats() });
});

export const health = (_request, response) => {
  response.json({ success: true, service: "lumina-api", status: "alive", timestamp: new Date().toISOString() });
};

export const readiness = asyncHandler(async (_request, response) => {
  const result = await readinessStatus();
  response.status(result.ready ? 200 : 503).json({
    success: result.ready,
    service: "lumina-api",
    status: result.ready ? "ready" : "not_ready",
    checks: result.checks,
    timestamp: new Date().toISOString(),
  });
});
