import { describe, expect, it } from 'vitest';
import { CreateLinkGuard } from './createLinkGuard.js';

describe('CreateLinkGuard', () => {
  it('allows under the cap then blocks', () => {
    const guard = new CreateLinkGuard(60_000, 2, 2);
    expect(guard.check('1.1.1.1', 'ev1')).toBeNull();
    guard.record('1.1.1.1', 'ev1');
    expect(guard.check('1.1.1.1', 'ev1')).toBeNull();
    guard.record('1.1.1.1', 'ev1');
    expect(guard.check('1.1.1.1', 'ev2')).toMatch(/this IP/);
    expect(guard.check('2.2.2.2', 'ev1')).toMatch(/this event/);
  });

  it('isolates different IPs and events', () => {
    const guard = new CreateLinkGuard(60_000, 1, 1);
    guard.record('1.1.1.1', 'ev1');
    expect(guard.check('9.9.9.9', 'ev9')).toBeNull();
  });
});
