// File: server/controllers/miscController.js
import path from "node:path";
import sharp from "sharp";
import { asyncHandler } from "../utils/asyncHandler.js";
import { adminStats, getSettings, searchEverything, updateSettings } from "../services/dataService.js";
import { audit } from "../services/auditService.js";

export const uploadFiles = asyncHandler(async (request, response) => {
  const files = [];
  for (const file of request.files || []) {
    let filename = file.filename;
    let size = file.size;
    if (file.mimetype.startsWith("image/") && !["image/gif"].includes(file.mimetype) && file.size > 500_000) {
      const target = file.path.replace(path.extname(file.path), ".webp");
      const result = await sharp(file.path).rotate().resize({ width: 2200, withoutEnlargement: true }).webp({ quality: 84 }).toFile(target);
      filename = path.basename(target);
      size = result.size;
    }
    files.push({
      id: filename,
      name: file.originalname,
      type: file.mimetype,
      size,
      url: `/uploads/${filename}`,
    });
  }
  await audit(request, "upload", "file", null, { count: files.length });
  response.status(201).json({ success: true, data: files });
});

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
  response.json({ success: true, service: "lumina-api", timestamp: new Date().toISOString() });
};
