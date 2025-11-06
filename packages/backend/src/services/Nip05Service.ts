// NIP-05 Service - Handles name registration and nostr.json generation
import { Logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { nip19 } from 'nostr-tools';

export interface Nip05Registration {
  id: string;
  userChoice: string; // User's chosen prefix
  suffix: string; // Generated 4-digit numeric suffix
  fullName: string; // userChoice + suffix
  pubkey: string; // Nostr public key (npub format) - for display/user-facing
  pubkeyHex: string; // Nostr public key (hex format) - for nostr.json output
  domain: string; // Your domain
  paid: boolean;
  paymentProof?: string; // LNbits payment ID or invoice
  createdAt: Date;
}

interface Nip05Json {
  names: Record<string, string>; // name -> pubkey mapping
  relays?: Record<string, string[]>; // Optional: pubkey -> relays
}

export class Nip05Service {
  private logger: Logger;
  private registrations: Map<string, Nip05Registration> = new Map();
  private storagePath: string;
  private readonly PRICE_SATS = 1000;
  private readonly DOMAIN: string;

  constructor() {
    this.logger = new Logger('Nip05Service');
    // Storage file in backend directory
    this.storagePath = path.resolve(__dirname, '../../nip05-registrations.json');
    this.DOMAIN = process.env['NIP05_DOMAIN'] || 'yourdomain.com';
    
    // Load existing registrations
    this.loadRegistrations().catch(err => {
      this.logger.error('Failed to load registrations:', err);
    });
  }

  /**
   * Generate 4-digit numeric suffix
   */
  private generateSuffix(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Validate user's chosen name prefix
   */
  validateUserChoice(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'Name is required' };
    }

    // Only allow alphanumeric, 3-20 characters
    if (!/^[a-zA-Z0-9]{3,20}$/.test(name)) {
      return {
        valid: false,
        error: 'Name must be 3-20 alphanumeric characters only'
      };
    }

    // Check rate limiting (max 5 registrations per pubkey)
    // This would be checked when registering, not here

    return { valid: true };
  }

  /**
   * Check if a full name already exists
   */
  private nameExists(fullName: string): boolean {
    return this.registrations.has(fullName);
  }

  /**
   * Register a new NIP-05 name
   */
  async registerName(
    userChoice: string,
    pubkey: string,
    paymentProof: string,
    suffix?: string
  ): Promise<Nip05Registration> {
    // Validate user choice
    const validation = this.validateUserChoice(userChoice);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid name');
    }

    // Validate pubkey format (should be npub)
    if (!pubkey || !pubkey.startsWith('npub')) {
      throw new Error('Invalid Nostr public key. Must be npub format.');
    }

    // Decode npub to hex format
    let pubkeyHex: string;
    try {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === 'npub') {
        pubkeyHex = decoded.data as string;
      } else {
        throw new Error('Invalid npub format');
      }
    } catch (error) {
      throw new Error(`Failed to decode npub: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check rate limiting: max 5 registrations per pubkey (check by hex to avoid duplicates)
    const existingRegistrations = Array.from(this.registrations.values()).filter(
      r => (r.pubkeyHex || this.npubToHex(r.pubkey)) === pubkeyHex
    );
    if (existingRegistrations.length >= 5) {
      throw new Error(
        'Maximum 5 NIP-05 names per public key. Please use an existing registration.'
      );
    }

    // Use provided suffix or generate new one
    let finalSuffix: string;
    let fullName: string;
    let attempts = 0;
    const maxAttempts = 10;

    if (suffix) {
      // Use provided suffix
      finalSuffix = suffix;
      fullName = `${userChoice}${finalSuffix}`;
      
      // Check if name already exists
      if (this.nameExists(fullName)) {
        throw new Error('Name already exists. Please try again.');
      }
    } else {
      // Generate suffix and create full name
      // Ensure uniqueness (extremely unlikely collision, but safe)
      do {
        finalSuffix = this.generateSuffix();
        fullName = `${userChoice}${finalSuffix}`;
        attempts++;

        if (attempts > maxAttempts) {
          throw new Error(
            'Unable to generate unique name. Please try again.'
          );
        }
      } while (this.nameExists(fullName));
    }

    // Create registration
    const registration: Nip05Registration = {
      id: `nip05_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userChoice: userChoice.toLowerCase(), // Normalize to lowercase
      suffix: finalSuffix,
      fullName,
      pubkey, // Store npub for user-facing display
      pubkeyHex, // Store hex for nostr.json output
      domain: this.DOMAIN,
      paid: true,
      paymentProof,
      createdAt: new Date()
    };

    // Store registration
    this.registrations.set(fullName, registration);
    
    // Persist to file
    await this.saveRegistrations();

    // Update nostr.json file
    await this.updateNostrJson();

    this.logger.info(`✅ Registered NIP-05: ${fullName}@${this.DOMAIN} for ${pubkey.substring(0, 16)}...`);

    return registration;
  }

  /**
   * Get registration by full name
   */
  getRegistration(fullName: string): Nip05Registration | null {
    return this.registrations.get(fullName) || null;
  }

  /**
   * Get all registrations for a pubkey
   */
  getRegistrationsByPubkey(pubkey: string): Nip05Registration[] {
    return Array.from(this.registrations.values()).filter(
      r => r.pubkey === pubkey
    );
  }

  /**
   * Get registration by payment proof (checking_id)
   */
  getRegistrationByPaymentProof(paymentProof: string): Nip05Registration | null {
    for (const reg of this.registrations.values()) {
      if (reg.paymentProof === paymentProof) {
        return reg;
      }
    }
    return null;
  }

  /**
   * Get all registrations (for admin/debugging)
   */
  getAllRegistrations(): Nip05Registration[] {
    return Array.from(this.registrations.values());
  }

  /**
   * Helper to convert npub to hex (for backward compatibility with old registrations)
   */
  private npubToHex(npub: string): string {
    try {
      if (npub.startsWith('npub')) {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
          return decoded.data as string;
        }
      }
      // Assume it's already hex
      return npub;
    } catch {
      return npub; // Fallback to original value
    }
  }

  /**
   * Generate nostr.json content
   * Always outputs hex format (NIP-05 requirement)
   */
  private generateNostrJson(name?: string): Nip05Json {
    const names: Record<string, string> = {};
    
    // Only include paid registrations
    for (const reg of this.registrations.values()) {
      if (reg.paid) {
        // Always use hex format for nostr.json (NIP-05 requires hex, not npub)
        // Use pubkeyHex if available, otherwise convert from npub (for backward compatibility)
        const pubkeyHex = reg.pubkeyHex || this.npubToHex(reg.pubkey);

        // If name filter is provided and not empty, only include matching names
        // Empty string should be treated as "no filter" (undefined)
        if (name && name.trim() !== '') {
          if (reg.fullName === name.trim()) {
            names[reg.fullName] = pubkeyHex;
          }
        } else {
          // No filter - include all
          names[reg.fullName] = pubkeyHex;
        }
      }
    }

    return { names };
  }

  /**
   * Update .well-known/nostr.json file
   */
  async updateNostrJson(): Promise<void> {
    try {
      const json = this.generateNostrJson();
      const jsonString = JSON.stringify(json, null, 2);
      
      // Note: In production, this should be written to the web server's .well-known directory
      // For now, we'll write it to a location that can be served
      const nostrJsonPath = path.resolve(__dirname, '../../public/.well-known/nostr.json');
      const wellKnownDir = path.dirname(nostrJsonPath);
      
      // Ensure directory exists (recursive creates all parent directories)
      await fs.mkdir(wellKnownDir, { recursive: true });
      
      // Write file
      await fs.writeFile(nostrJsonPath, jsonString, 'utf-8');
      
      this.logger.info(`✅ Updated nostr.json with ${Object.keys(json.names).length} names`);
    } catch (error: any) {
      this.logger.error('Failed to update nostr.json:', error);
      // Don't throw - allow the service to continue even if file write fails
      // The route handler will generate it on-demand
      console.warn('Warning: Could not write nostr.json file, but service will serve it on-demand');
    }
  }

  /**
   * Get nostr.json content (for serving)
   * @param name Optional name filter - if provided, only returns that specific name
   */
  getNostrJson(name?: string): Nip05Json {
    return this.generateNostrJson(name);
  }

  /**
   * Load registrations from file
   */
  private async loadRegistrations(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const registrations = JSON.parse(data) as Nip05Registration[];
      
      let migratedCount = 0;
      
      // Convert date strings back to Date objects and migrate old registrations
      for (const reg of registrations) {
        reg.createdAt = new Date(reg.createdAt);
        
        // Backward compatibility: if pubkeyHex is missing, generate it from npub
        if (!reg.pubkeyHex && reg.pubkey) {
          reg.pubkeyHex = this.npubToHex(reg.pubkey);
          migratedCount++;
        }
        
        this.registrations.set(reg.fullName, reg);
      }
      
      // If we migrated any registrations, save them back with the new format
      if (migratedCount > 0) {
        this.logger.info(`Migrated ${migratedCount} registrations to include pubkeyHex`);
        await this.saveRegistrations();
      }
      
      this.logger.info(`Loaded ${registrations.length} NIP-05 registrations`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - that's fine
        this.logger.info('No existing registrations file found. Starting fresh.');
      } else {
        this.logger.error('Failed to load registrations:', error);
      }
    }
  }

  /**
   * Save registrations to file
   */
  private async saveRegistrations(): Promise<void> {
    try {
      const registrations = Array.from(this.registrations.values());
      await fs.writeFile(
        this.storagePath,
        JSON.stringify(registrations, null, 2),
        'utf-8'
      );
    } catch (error) {
      this.logger.error('Failed to save registrations:', error);
      throw error;
    }
  }

  /**
   * Get service price in sats
   */
  getPrice(): number {
    return this.PRICE_SATS;
  }

  /**
   * Get domain
   */
  getDomain(): string {
    return this.DOMAIN;
  }
}

