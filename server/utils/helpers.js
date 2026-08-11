import xss from "xss";

export function cleanText(value, maxLength = 4_000) {
  if (typeof value !== "string") return "";
  return xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ["script"] })
    .trim()
    .slice(0, maxLength);
}

export function publicUser(input) {
  if (!input) return null;
  const source = typeof input.toObject === "function" ? input.toObject() : input;
  const { password, passwordHash, refreshTokens, ...safe } = source;
  return {
    ...safe,
    id: String(source.id || source._id),
    _id: undefined,
  };
}

export const unique = (items) => [...new Set(items.map(String))];
