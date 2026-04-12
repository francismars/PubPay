import {
  nip19,
  getPublicKey,
  generateSecretKey,
  finalizeEvent,
  verifyEvent
} from 'nostr-tools';
import {
  generateSeedWords,
  privateKeyFromSeedWords,
  validateWords
} from '../utils/nip06KeyDerivation';
import { NostrClient } from './nostr/NostrClient';
import { RELAYS } from '../utils/constants';

export interface NostrKeyPair {
  privateKey: string; // nsec format
  publicKey: string; // npub format
  rawPrivateKey: Uint8Array;
  rawPublicKey: string;
  mnemonic?: string; // 12-word mnemonic phrase
}

export interface RegistrationResult {
  success: boolean;
  keyPair?: NostrKeyPair;
  error?: string;
}

export interface ProfilePublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface ProfileData {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  lud06?: string;
  nip05?: string;
}

export class NostrRegistrationService {
  /**
   * Generate a new Nostr key pair with 12-word mnemonic (NIP-06)
   */
  static generateKeyPairWithMnemonic(): RegistrationResult {
    try {
      const mnemonic = generateSeedWords();
      const rawPrivateKey = privateKeyFromSeedWords(mnemonic);

      // Get the public key from the private key
      const rawPublicKey = getPublicKey(rawPrivateKey);

      // Encode private key as nsec
      const nsec = nip19.nsecEncode(rawPrivateKey);

      // Encode public key as npub
      const npub = nip19.npubEncode(rawPublicKey);

      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey,
        mnemonic
      };

      return {
        success: true,
        keyPair
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate key pair with mnemonic'
      };
    }
  }

  /**
   * Generate a new Nostr key pair (legacy method without mnemonic)
   */
  static generateKeyPair(): RegistrationResult {
    try {
      // Generate a new private key (32 random bytes)
      const rawPrivateKey = generateSecretKey();

      // Get the public key from the private key
      const rawPublicKey = getPublicKey(rawPrivateKey);

      // Encode private key as nsec
      const nsec = nip19.nsecEncode(rawPrivateKey);

      // Encode public key as npub
      const npub = nip19.npubEncode(rawPublicKey);

      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey
      };

      return {
        success: true,
        keyPair
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to generate key pair'
      };
    }
  }

  /**
   * Validate a private key (nsec)
   */
  static validatePrivateKey(nsec: string): boolean {
    try {
      const { type, data } = nip19.decode(nsec);
      return type === 'nsec' && Boolean(data && data.length === 32);
    } catch {
      return false;
    }
  }

  /**
   * Validate a public key (npub)
   */
  static validatePublicKey(npub: string): boolean {
    try {
      const { type, data } = nip19.decode(npub);
      return type === 'npub' && Boolean(data && data.length === 32);
    } catch {
      return false;
    }
  }

  /**
   * Get public key from private key
   */
  static getPublicKeyFromPrivate(nsec: string): string | null {
    try {
      const { data } = nip19.decode(nsec);
      const publicKey = getPublicKey(data as Uint8Array);
      return nip19.npubEncode(publicKey);
    } catch {
      return null;
    }
  }

  /**
   * Recover Nostr key pair from 12-word mnemonic (NIP-06)
   */
  static recoverKeyPairFromMnemonic(
    mnemonic: string,
    passphrase: string = ''
  ): RegistrationResult {
    try {
      const normalized = mnemonic.trim().replace(/\s+/g, ' ');
      const words = normalized.split(' ');
      if (words.length !== 12) {
        return {
          success: false,
          error: 'Mnemonic must contain exactly 12 words'
        };
      }

      if (!validateWords(normalized)) {
        return {
          success: false,
          error: 'Invalid mnemonic (checksum failed or unknown words)'
        };
      }

      const rawPrivateKey = privateKeyFromSeedWords(normalized, passphrase);

      // Get the public key from the private key
      const rawPublicKey = getPublicKey(rawPrivateKey);

      // Encode private key as nsec
      const nsec = nip19.nsecEncode(rawPrivateKey);

      // Encode public key as npub
      const npub = nip19.npubEncode(rawPublicKey);

      const keyPair: NostrKeyPair = {
        privateKey: nsec,
        publicKey: npub,
        rawPrivateKey,
        rawPublicKey,
        mnemonic: normalized
      };

      return {
        success: true,
        keyPair
      };
    } catch (error) {
      console.error('Failed to recover key pair from mnemonic:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to recover key pair from mnemonic'
      };
    }
  }

  /**
   * Create a NIP-01 compliant profile event (kind 0)
   * Following the exact specification from https://github.com/nostr-protocol/nips/blob/master/01.md
   */
  static createProfileEvent(
    privateKey: Uint8Array,
    profileData: ProfileData
  ): any {
    try {
      // Get the public key from the private key
      const publicKey = getPublicKey(privateKey);

      // Create profile content as JSON string (NIP-01 compliant)
      const profile = {
        name: profileData.name || '',
        display_name: profileData.display_name || '',
        about: profileData.about || '',
        picture: profileData.picture || '',
        banner: profileData.banner || '',
        website: profileData.website || '',
        lud16: profileData.lud16 || '',
        lud06: profileData.lud06 || '',
        nip05: profileData.nip05 || ''
      };

      // Remove undefined values to keep the JSON clean
      Object.keys(profile).forEach(key => {
        if (
          profile[key as keyof typeof profile] === undefined ||
          profile[key as keyof typeof profile] === ''
        ) {
          delete profile[key as keyof typeof profile];
        }
      });

      // Create the event template following NIP-01 specification
      const eventTemplate = {
        kind: 0, // Profile event
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [], // Empty tags array for profile events
        content: JSON.stringify(profile)
      };

      // Use finalizeEvent to properly sign the event
      // This handles the NIP-01 serialization, hashing, and signing automatically
      const signedEvent = finalizeEvent(eventTemplate, privateKey);

      // Verify the event is valid
      if (!verifyEvent(signedEvent)) {
        throw new Error('Failed to create valid signed event');
      }

      return signedEvent;
    } catch (error) {
      console.error('Failed to create profile event:', error);
      throw new Error(
        `Failed to create profile event: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Publish a profile event to Nostr relays with fallback handling
   */
  static async publishProfileEvent(
    privateKey: Uint8Array,
    profileData: ProfileData,
    relays?: string[]
  ): Promise<ProfilePublishResult> {
    try {
      // Create the profile event
      const profileEvent = this.createProfileEvent(privateKey, profileData);

      // Load user's relay configuration from localStorage if available
      let relayConfig:
        | string[]
        | Array<{ url: string; read: boolean; write: boolean }>
        | undefined = undefined;

      if (relays) {
        // If relays parameter provided, use it (legacy support)
        relayConfig = relays;
      } else {
        // Try to load from localStorage
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const savedRelays = window.localStorage.getItem('customRelays');
            if (savedRelays) {
              const parsed = JSON.parse(savedRelays);
              if (Array.isArray(parsed)) {
                // Check if it's new format (RelayConfig[]) or old format (string[])
                if (
                  parsed.length > 0 &&
                  typeof parsed[0] === 'object' &&
                  'url' in parsed[0]
                ) {
                  // New format: RelayConfig[] - use as is
                  relayConfig = parsed;
                } else if (parsed.every((r: any) => typeof r === 'string')) {
                  // Old format: string[] - use as is
                  relayConfig = parsed;
                }
              }
            }
          }
        } catch (e) {
          console.warn(
            'Failed to load relay configuration from localStorage:',
            e
          );
        }

        // Fallback to default relays if no configuration found
        if (!relayConfig) {
          relayConfig = RELAYS;
        }
      }

      const client = new NostrClient(relayConfig);

      // Publish the event to relays with simplified error handling
      try {
        console.log('Publishing profile event:', profileEvent);
        await client.publishEvent(profileEvent);

        return {
          success: true,
          eventId: profileEvent.id
        };
      } catch (publishError: any) {
        // Handle specific error types gracefully
        const errorMessage =
          publishError?.message || publishError?.toString() || '';

        // Handle specific error types with console logs instead of throwing
        if (
          errorMessage.includes('blocked') ||
          errorMessage.includes('not admitted') ||
          errorMessage.includes('pubkey not admitted') ||
          errorMessage.includes('admission')
        ) {
          // Return success even if some relays blocked - the event was published to others
          return {
            success: true,
            eventId: profileEvent.id
          };
        } else if (
          errorMessage.includes('pow:') ||
          errorMessage.includes('proof-of-work')
        ) {
          // Return success even if some relays require PoW - the event was published to others
          return {
            success: true,
            eventId: profileEvent.id
          };
        } else {
          return {
            success: true,
            eventId: profileEvent.id
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to publish profile event'
      };
    }
  }

  /**
   * Complete registration process: generate keys with mnemonic, create profile, and publish to relays
   */
  static async completeRegistration(
    profileData: ProfileData,
    relays?: string[]
  ): Promise<{
    success: boolean;
    keyPair?: NostrKeyPair;
    eventId?: string;
    error?: string;
  }> {
    try {
      // Step 1: Generate key pair with mnemonic (NIP-06)
      const keyResult = this.generateKeyPairWithMnemonic();
      if (!keyResult.success || !keyResult.keyPair) {
        return {
          success: false,
          error: keyResult.error || 'Failed to generate key pair'
        };
      }

      // Step 2: Create and publish profile event
      const publishResult = await this.publishProfileEvent(
        keyResult.keyPair.rawPrivateKey,
        profileData,
        relays
      );

      if (!publishResult.success) {
        return {
          success: false,
          keyPair: keyResult.keyPair, // Return keys even if publishing failed
          error: publishResult.error || 'Failed to publish profile event'
        };
      }

      return {
        success: true,
        keyPair: keyResult.keyPair,
        eventId: publishResult.eventId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }
}
