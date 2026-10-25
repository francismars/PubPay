import { appSessionStorage } from './storage';

export const ROOM_PASSWORD_HEADER = 'X-Room-Password';
export const ROOM_ADMIN_TOKEN_HEADER = 'X-Room-Admin-Token';

export function getRoomPassword(roomId: string): string | null {
  return appSessionStorage.getItem<string>(`room_${roomId}_password`);
}

export function getRoomAdminToken(roomId: string): string | null {
  return appSessionStorage.getItem<string>(`room_${roomId}_admin_token`);
}

export function storeRoomCredentials(
  roomId: string,
  opts: { password?: string; adminToken?: string }
): void {
  if (opts.password && opts.password.trim()) {
    appSessionStorage.setItem(`room_${roomId}_password`, opts.password.trim());
  }
  if (opts.adminToken && opts.adminToken.trim()) {
    appSessionStorage.setItem(
      `room_${roomId}_admin_token`,
      opts.adminToken.trim()
    );
  }
}

export function clearRoomCredentials(roomId: string): void {
  appSessionStorage.removeItem(`room_${roomId}_password`);
  appSessionStorage.removeItem(`room_${roomId}_admin_token`);
}

export function roomAuthHeaders(
  roomId: string,
  extra?: HeadersInit
): Headers {
  const headers = new Headers(extra);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const password = getRoomPassword(roomId);
  if (password) {
    headers.set(ROOM_PASSWORD_HEADER, password);
  }
  const adminToken = getRoomAdminToken(roomId);
  if (adminToken) {
    headers.set(ROOM_ADMIN_TOKEN_HEADER, adminToken);
  }
  return headers;
}
