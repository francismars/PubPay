import { describe, expect, it } from 'vitest';
import { RoomsService } from './RoomsService.js';

describe('RoomsService auth', () => {
  it('createRoom returns one-time adminToken; hash stored separately', async () => {
    const rooms = new RoomsService();
    const { config, adminToken } = await rooms.createRoom({
      name: 'Test',
      rotationIntervalSec: 30
    });

    expect(adminToken.length).toBeGreaterThan(20);
    expect(config.id).toBeTruthy();

    const room = rooms.getRoom(config.id)!;
    expect(room.config.adminTokenHash).toBeTruthy();
    expect(room.config.adminTokenHash).not.toContain(adminToken);

    expect(await rooms.verifyRoomCredential(room, undefined, adminToken)).toBe(
      true
    );
    expect(
      await rooms.verifyRoomCredential(room, undefined, 'wrong-token')
    ).toBe(false);
  });

  it('password auth works when set', async () => {
    const rooms = new RoomsService();
    const { config, adminToken } = await rooms.createRoom({
      name: 'Locked',
      rotationIntervalSec: 30,
      password: 'room-pass'
    });

    const room = rooms.getRoom(config.id)!;
    expect(await rooms.verifyRoomCredential(room, 'room-pass', undefined)).toBe(
      true
    );
    expect(await rooms.verifyRoomCredential(room, 'bad', undefined)).toBe(
      false
    );
    expect(await rooms.verifyRoomCredential(room, undefined, adminToken)).toBe(
      true
    );
  });
});
