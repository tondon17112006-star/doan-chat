export async function onlineUserIds(io, userIds) {
  const uniqueIds = [...new Set((userIds || []).map(String))];
  const checks = await Promise.all(uniqueIds.map(async (userId) => {
    try {
      const sockets = await io.in(userId).fetchSockets();
      return sockets.length ? userId : null;
    } catch {
      return null;
    }
  }));
  return checks.filter(Boolean);
}

export async function userIsOnline(io, userId) {
  return (await onlineUserIds(io, [userId])).length > 0;
}

export function emitToUsers(io, userIds, event, payload) {
  if (!io) return;
  for (const userId of new Set((userIds || []).map(String))) {
    io.to(userId).emit(event, payload);
  }
}
