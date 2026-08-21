import path from "node:path";
import { access, constants, mkdir, stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
export const defaultLocalUploadDirectory = path.resolve(directory, "../uploads");

function localUploadDirectory() {
  return path.resolve(process.env.LOCAL_UPLOAD_DIR || defaultLocalUploadDirectory);
}

function safeLocalPath(key) {
  const root = localUploadDirectory();
  if (!key) return root;
  const resolved = path.resolve(root, String(key || ""));
  if (path.dirname(resolved) !== root) throw new AppError("File not found.", 404);
  return resolved;
}

const localProvider = {
  name: "local",
  publicBasePath: "/api/uploads",
  async prepare() {
    await mkdir(localUploadDirectory(), { recursive: true });
  },
  resolveWritePath(key) {
    return safeLocalPath(key);
  },
  async exists(key) {
    try {
      await access(safeLocalPath(key), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },
  async stat(key) {
    return stat(safeLocalPath(key));
  },
  async remove(key) {
    await unlink(safeLocalPath(key)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  },
  send(key, response) {
    response.sendFile(safeLocalPath(key));
  },
};

function configuredCloudProvider(name) {
  return {
    name,
    publicBasePath: "/api/uploads",
    async prepare() {
      throw new AppError(`${name} storage is not enabled in this build. Configure the provider adapter before selecting it.`, 500);
    },
    resolveWritePath() {
      throw new AppError(`${name} storage does not support local multer writes. Use a streaming upload adapter.`, 500);
    },
    async exists() {
      throw new AppError(`${name} storage is not enabled in this build.`, 500);
    },
    async stat() {
      throw new AppError(`${name} storage is not enabled in this build.`, 500);
    },
    async remove() {
      throw new AppError(`${name} storage is not enabled in this build.`, 500);
    },
    send() {
      throw new AppError(`${name} storage is not enabled in this build.`, 500);
    },
  };
}

const providers = new Map([
  ["local", localProvider],
  ["s3", configuredCloudProvider("s3")],
  ["r2", configuredCloudProvider("r2")],
  ["cloudinary", configuredCloudProvider("cloudinary")],
]);

export function storageProviderName() {
  return String(process.env.STORAGE_PROVIDER || env.storage?.provider || "local").trim().toLowerCase() || "local";
}

export function getStorageProvider(name = storageProviderName()) {
  const provider = providers.get(name);
  if (!provider) throw new AppError("Configured storage provider is not supported.", 500);
  return provider;
}

export function uploadUrlFor(key) {
  return `${getStorageProvider().publicBasePath}/${key}`;
}

export function storageKeyFromUploadUrl(url) {
  const match = /^\/api\/uploads\/([a-f0-9-]+\.[a-z0-9]+)$/i.exec(String(url || ""));
  return match?.[1] || null;
}
