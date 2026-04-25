import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nip46LoginForm } from './Nip46LoginForm';
import { Nip46Service } from '@pubpay/shared-services';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async () => 'data:image/png;base64,mock-qr')
  }
}));

vi.mock('@pubpay/shared-services', () => ({
  Nip46Service: {
    createNostrConnectPairingRequest: vi.fn(),
    waitForNostrConnectPairing: vi.fn(),
    pairWithBunkerInput: vi.fn(),
    openSignerApp: vi.fn(),
    savePendingPairing: vi.fn(),
    clearPendingPairing: vi.fn()
  }
}));

const mockedNip46Service = vi.mocked(Nip46Service);

const setDevice = ({ userAgent, coarsePointer }: { userAgent: string; coarsePointer: boolean }) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)' ? coarsePointer : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
};

describe('Nip46LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    setDevice({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      coarsePointer: false
    });
    mockedNip46Service.createNostrConnectPairingRequest.mockReturnValue({
      uri: 'nostrconnect://pairing',
      clientSecretKey: new Uint8Array([1, 2, 3])
    });
    mockedNip46Service.waitForNostrConnectPairing.mockResolvedValue({
      publicKey: 'f'.repeat(64)
    });
  });

  it('auto-starts QR pairing on desktop when visible', async () => {
    render(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    await waitFor(() => {
      expect(
        mockedNip46Service.createNostrConnectPairingRequest
      ).toHaveBeenCalledTimes(1);
      expect(mockedNip46Service.createNostrConnectPairingRequest).toHaveBeenCalledWith(
        { includeCallbackRedirects: false }
      );
    });
    await screen.findByAltText('Nostr Connect QR');
  });

  it('does not duplicate desktop auto-start on re-render', async () => {
    const view = render(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    await waitFor(() => {
      expect(
        mockedNip46Service.createNostrConnectPairingRequest
      ).toHaveBeenCalledTimes(1);
      expect(mockedNip46Service.createNostrConnectPairingRequest).toHaveBeenCalledWith(
        { includeCallbackRedirects: false }
      );
    });

    view.rerender(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    expect(
      mockedNip46Service.createNostrConnectPairingRequest
    ).toHaveBeenCalledTimes(1);
  });

  it('opens signer app from mobile primary button', async () => {
    setDevice({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      coarsePointer: true
    });
    render(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open signer app' }));

    await waitFor(() => {
      expect(mockedNip46Service.createNostrConnectPairingRequest).toHaveBeenCalledWith(
        { includeCallbackRedirects: true }
      );
      expect(mockedNip46Service.openSignerApp).toHaveBeenCalledWith(
        'nostrconnect://pairing'
      );
      expect(
        mockedNip46Service.waitForNostrConnectPairing
      ).toHaveBeenCalledTimes(1);
    });
  });

  it('toggles mobile QR visibility with link label updates', async () => {
    setDevice({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      coarsePointer: true
    });
    render(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Use QR code instead' })
    );
    await screen.findByAltText('Nostr Connect QR');
    expect(
      screen.getByRole('button', { name: 'Hide QR code' })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide QR code' }));
    expect(screen.queryByAltText('Nostr Connect QR')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use QR code instead' })
    ).toBeInTheDocument();
  });

  it('shows QR URI preview and copies it', async () => {
    render(
      <Nip46LoginForm
        isVisible
        onBack={() => undefined}
        onComplete={async () => undefined}
      />
    );

    await screen.findByDisplayValue('nostrconnect://pairing');
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'nostrconnect://pairing'
    );
  });
});
