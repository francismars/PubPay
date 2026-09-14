import { appSessionStorage } from './storage';

export const ROOM_PASSWORD_HEADER = 'X-Room-Password';

export function getRoomPassword(roomId: string): string | null {
  return appSessionStorage.getItem<string>(`room_${roomId}_password`);
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
  return headers;
}
