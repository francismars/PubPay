import { useEffect, useRef } from 'react';
import { NostrClient, LightningService, ZapService, DEFAULT_READ_RELAYS, DEFAULT_WRITE_RELAYS } from '@pubpay/shared-services';
import { LightningConfig } from '@pubpay/shared-types';
import { STORAGE_KEYS } from '../constants';
import { usePostStore, useNostrReady } from '../stores/usePostStore';

export const useServices = () => {
  // Use store for nostrReady state
  // Use reusable selector hooks
  const nostrReady = useNostrReady();
  const setNostrReady = usePostStore(state => state.setNostrReady);
  const nostrClientRef = useRef<NostrClient | null>(null);
  const lightningServiceRef = useRef<LightningService | null>(null);
  const zapServiceRef = useRef<ZapService | null>(null);

  // Initialize services (only once)
  useEffect(() => {
    // Prevent duplicate initialization
    if (nostrClientRef.current) {
      return;
    }

    const initializeServices = () => {
      try {
        // Initialize Nostr client with user custom relays if present
        let initialRelays: string[] | Array<{ url: string; read: boolean; write: boolean }> | undefined = undefined;
        try {
          const savedRelays = localStorage.getItem(STORAGE_KEYS.CUSTOM_RELAYS);
          if (savedRelays) {
            const parsed = JSON.parse(savedRelays);
            if (Array.isArray(parsed)) {
              // Check if it's the new format (RelayConfig[]) or old format (string[])
              if (parsed.length > 0 && typeof parsed[0] === 'object' && 'url' in parsed[0]) {
                // New format: RelayConfig[]
                initialRelays = parsed;
              } else if (parsed.every(r => typeof r === 'string')) {
                // Old format: string[] - pass as is (will be handled by NostrClient)
                initialRelays = parsed;
              }
            }
          } else {
            // No saved relays - initialize from constants to ensure correct default read/write config
            // This matches what SettingsPage does, ensuring consistency
            const allDefaultRelays = [...new Set([...DEFAULT_READ_RELAYS, ...DEFAULT_WRITE_RELAYS])];
            initialRelays = allDefaultRelays.map(url => ({
              url,
              read: DEFAULT_READ_RELAYS.includes(url),
              write: DEFAULT_WRITE_RELAYS.includes(url)
            }));
            // Save to localStorage so SettingsPage can load it
            localStorage.setItem(STORAGE_KEYS.CUSTOM_RELAYS, JSON.stringify(initialRelays));
          }
        } catch {
          // Ignore errors parsing saved relays
        }
        nostrClientRef.current = new NostrClient(initialRelays as any);

        // Initialize Lightning service
        // Frontend doesn't need API keys - it only calls backend API
        // Backend handles all LNBits communication with server-side credentials
        const lightningConfig: LightningConfig = {
          enabled: true
          // lnbitsUrl, apiKey, webhookUrl are not needed in frontend
          // They are only used by backend service (server-side only)
        };
        lightningServiceRef.current = new LightningService(lightningConfig);

        // Initialize Zap service
        zapServiceRef.current = new ZapService();

        console.log('Services initialized');
        setNostrReady(true);
      } catch (err) {
        console.error('Failed to initialize services:', err);
        console.error(
          'Failed to initialize services. Please refresh the page.'
        );
      }
    };

    initializeServices();

    // Listen for relay updates from Settings and re-init Nostr client
    const handleRelaysUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as
          | { relays?: string[]; relayConfig?: Array<{ url: string; read: boolean; write: boolean }> }
          | undefined;
        // Prefer relayConfig (new format) over relays (old format)
        let nextRelays: string[] | Array<{ url: string; read: boolean; write: boolean }> | undefined = undefined;
        if (detail?.relayConfig && Array.isArray(detail.relayConfig)) {
          nextRelays = detail.relayConfig;
        } else if (detail?.relays && Array.isArray(detail.relays)) {
          // Fallback to old format for backward compatibility
          nextRelays = detail.relays;
        }
        nostrClientRef.current = new NostrClient(nextRelays as any);
        console.log('Nostr client reinitialized with relays:', nextRelays);
      } catch {
        // Ignore errors handling relay updates
      }
    };
    window.addEventListener(
      'relaysUpdated',
      handleRelaysUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        'relaysUpdated',
        handleRelaysUpdated as EventListener
      );
    };
  }, []);

  // Cleanup services on unmount
  useEffect(() => {
    return () => {
      try {
        if (nostrClientRef.current) {
          nostrClientRef.current.destroy();
        }
        if (lightningServiceRef.current) {
          lightningServiceRef.current.destroy();
        }
      } catch (error) {
        // Ignore cleanup errors
        console.warn('Error during cleanup:', error);
      }
    };
  }, []);

  return {
    nostrReady,
    setNostrReady,
    nostrClientRef,
    lightningServiceRef,
    zapServiceRef
  };
};

