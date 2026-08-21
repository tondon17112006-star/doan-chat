import { readFile } from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { AppError } from "../utils/AppError.js";
import { getStorageProvider } from "../services/storageProvider.js";

export const uploadDirectory = getStorageProvider("local").resolveWritePath("");
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 10;

const fileTypes = {
  "image/jpeg": { extensions: [".jpg", ".jpeg"], extension: ".jpg", imageFormat: "jpeg" },
  "image/png": { extensions: [".png"], extension: ".png", imageFormat: "png" },
  "image/gif": { extensions: [".gif"], extension: ".gif", imageFormat: "gif" },
  "image/webp": { extensions: [".webp"], extension: ".webp", imageFormat: "webp" },
  "video/mp4": { extensions: [".mp4"], extension: ".mp4" },
  "video/quicktime": { extensions: [".mov"], extension: ".mov" },
  "video/webm": { extensions: [".webm"], extension: ".webm" },
  "audio/mpeg": { extensions: [".mp3"], extension: ".mp3" },
  "audio/wav": { extensions: [".wav"], extension: ".wav" },
  "audio/x-wav": { extensions: [".wav"], extension: ".wav" },
  "audio/webm": { extensions: [".webm"], extension: ".webm" },
  "application/pdf": { extensions: [".pdf"], extension: ".pdf", pdf: true },
  "application/msword": { extensions: [".doc"], extension: ".doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: [".docx"], extension: ".docx" },
  "application/vnd.ms-excel": { extensions: [".xls"], extension: ".xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: [".xlsx"], extension: ".xlsx" },
  "application/vnd.ms-powerpoint": { extensions: [".ppt"], extension: ".ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: [".pptx"], extension: ".pptx" },
  "application/zip": { extensions: [".zip"], extension: ".zip" },
  "application/x-zip-compressed": { extensions: [".zip"], extension: ".zip" },
  "application/vnd.rar": { extensions: [".rar"], extension: ".rar" },
  "application/x-rar-compressed": { extensions: [".rar"], extension: ".rar" },
};

export function uploadType(mimeType) {
  return fileTypes[String(mimeType || "").toLowerCase()] || null;
}

function invalidUpload(message) {
  return new AppError(message, 400);
}

const storage = multer.diskStorage({
  destination: async (_request, _file, callback) => {
    try {
      await getStorageProvider("local").prepare();
      callback(null, uploadDirectory);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_request, file, callback) => {
    const type = uploadType(file.mimetype);
    if (!type) return callback(invalidUpload("This file type is not allowed."));
    callback(null, `${crypto.randomUUID()}${type.extension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_request, file, callback) => {
    const type = uploadType(file.mimetype);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!type || !type.extensions.includes(extension)) {
      return callback(invalidUpload("The file MIME type and extension must be in the supported upload allowlist."));
    }
    callback(null, true);
  },
});

export async function validateUploadedFile(file) {
  const type = uploadType(file.mimetype);
  if (!type) throw invalidUpload("This file type is not allowed.");
  if (type.imageFormat) {
    let metadata;
    try {
      metadata = await sharp(file.path, { animated: true }).metadata();
    } catch {
      throw invalidUpload("The image content is invalid or does not match its declared type.");
    }
    if (metadata.format !== type.imageFormat) {
      throw invalidUpload("The image content does not match its declared MIME type.");
    }
  }
  if (type.pdf) {
    const signature = await readFile(file.path, { encoding: null }).then((contents) => contents.subarray(0, 5).toString("ascii"));
    if (signature !== "%PDF-") throw invalidUpload("The PDF content is invalid or does not match its declared type.");
  }
}

export function safeOriginalName(name) {
  const value = path.basename(String(name || "Attachment")).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return (value || "Attachment").slice(0, 255);
}
