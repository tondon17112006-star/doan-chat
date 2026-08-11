import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const isPrivateUpload = (url) => typeof url === "string" && url.startsWith("/api/uploads/");
const apiPath = (url) => url.replace(/^\/api/, "");

export function usePrivateUploadUrl(source) {
  const [resolved, setResolved] = useState(() => isPrivateUpload(source) ? "" : source || "");

  useEffect(() => {
    if (!isPrivateUpload(source)) {
      setResolved(source || "");
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    setResolved("");
    api.get(apiPath(source), { responseType: "blob" })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        if (active) setResolved(objectUrl);
      })
      .catch(() => active && setResolved(""));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return resolved;
}

export function SecureImage({ src, alt = "", ...props }) {
  const resolved = usePrivateUploadUrl(src);
  return resolved ? <img src={resolved} alt={alt} {...props} /> : null;
}

export function SecureVideo({ src, ...props }) {
  const resolved = usePrivateUploadUrl(src);
  return resolved ? <video src={resolved} {...props} /> : null;
}

export async function downloadPrivateUpload(source, filename) {
  if (!isPrivateUpload(source)) {
    window.open(source, "_blank", "noopener,noreferrer");
    return;
  }
  const response = await api.get(apiPath(source), { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename || "attachment";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
