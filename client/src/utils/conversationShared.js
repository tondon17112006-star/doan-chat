export function getSharedItems(messages) {
  const attachments = messages.flatMap((message) => (message.attachments || []).map((attachment, index) => ({
    ...attachment,
    key: `${message.id}-${attachment.id || attachment.url || index}`,
  })));
  const links = [];
  const seenLinks = new Set();

  for (const message of messages) {
    for (const match of String(message.content || "").matchAll(/https?:\/\/[^\s<>\"']+/gi)) {
      const url = match[0].replace(/[),.!?;:]+$/, "");
      if (!url || seenLinks.has(url)) continue;
      try {
        links.push({ key: `${message.id}-${url}`, url, label: new URL(url).hostname });
        seenLinks.add(url);
      } catch {
        // Ignore malformed URLs from message text.
      }
    }
  }

  return {
    media: attachments.filter((attachment) => attachment.type?.startsWith("image/") || attachment.type?.startsWith("video/")),
    files: attachments.filter((attachment) => !attachment.type?.startsWith("image/") && !attachment.type?.startsWith("video/")),
    links,
  };
}

export function formatAttachmentBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
