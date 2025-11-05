// NIP-05 Validation Service - Validates NIP-05 identifiers
export class Nip05ValidationService {
  // In-memory cache for NIP-05 validation (only during processing, not persistent)
  private static nip05ValidationCache = new Map<
    string,
    { valid: boolean; timestamp: number; pubkey?: string }
  >();
  private static readonly VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Validate if a NIP-05 identifier exists and maps to the correct pubkey
   * Returns true if valid, false if invalid
   * @param nip05 - The NIP-05 identifier (e.g., "alice@example.com")
   * @param expectedPubkey - The expected Nostr public key (hex format, 64 chars)
   */
  static async validateNip05(
    nip05: string,
    expectedPubkey?: string
  ): Promise<boolean> {
    if (!nip05 || typeof nip05 !== 'string') {
      return false;
    }

    // Basic format check
    const nip05Split = nip05.split('@');
    if (nip05Split.length !== 2) {
      this.nip05ValidationCache.set(nip05, {
        valid: false,
        timestamp: Date.now()
      });
      return false;
    }

    const [name, domain] = nip05Split;

    // Check in-memory cache first (only for current session)
    const cacheKey = expectedPubkey ? `${nip05}:${expectedPubkey}` : nip05;
    const cached = this.nip05ValidationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.VALIDATION_CACHE_TTL) {
      // If we have a cached pubkey and it matches expected, return cached result
      if (expectedPubkey && cached.pubkey === expectedPubkey) {
        return cached.valid;
      }
      // If no expected pubkey, just return cached result
      if (!expectedPubkey) {
        return cached.valid;
      }
    }

    try {
      // Check if we're already validating this NIP-05 (prevent duplicate calls)
      const validationKey = `validating:${cacheKey}`;
      if (this.nip05ValidationCache.has(validationKey)) {
        // Wait a bit for the ongoing validation
        await new Promise(resolve => setTimeout(resolve, 100));
        const cached = this.nip05ValidationCache.get(cacheKey);
        if (cached) {
          return cached.valid;
        }
        // If still not cached, proceed with validation
      }

      // Mark as validating to prevent duplicate calls
      this.nip05ValidationCache.set(validationKey, {
        valid: false,
        timestamp: Date.now()
      });

      const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          method: 'GET',
          headers: {
            Accept: 'application/json'
          }
        });

        clearTimeout(timeoutId);
        this.nip05ValidationCache.delete(validationKey);

        if (!response.ok) {
          this.nip05ValidationCache.set(cacheKey, {
            valid: false,
            timestamp: Date.now()
          });
          return false;
        }

        const data = await response.json();

        // Validate NIP-05 format: { names: { "name": "pubkey" } }
        if (!data || !data.names || typeof data.names !== 'object') {
          this.nip05ValidationCache.set(cacheKey, {
            valid: false,
            timestamp: Date.now()
          });
          return false;
        }

        // Check if the name exists in the names object
        const registeredPubkey = data.names[name];
        if (!registeredPubkey || typeof registeredPubkey !== 'string') {
          this.nip05ValidationCache.set(cacheKey, {
            valid: false,
            timestamp: Date.now()
          });
          return false;
        }

        // If expected pubkey is provided, verify it matches
        let isValid = true;
        if (expectedPubkey) {
          // Normalize pubkeys for comparison (remove npub prefix if present)
          const normalizedRegistered = registeredPubkey.startsWith('npub')
            ? registeredPubkey
            : registeredPubkey;
          const normalizedExpected = expectedPubkey.startsWith('npub')
            ? expectedPubkey
            : expectedPubkey;

          // Compare hex pubkeys (64 chars) or npub format
          isValid =
            normalizedRegistered.toLowerCase() === normalizedExpected.toLowerCase();
        }

        this.nip05ValidationCache.set(cacheKey, {
          valid: isValid,
          timestamp: Date.now(),
          pubkey: registeredPubkey
        });
        return isValid;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        this.nip05ValidationCache.delete(validationKey);

        // Network errors, timeouts, or CORS errors - treat as invalid silently
        // CORS errors are common when servers don't allow cross-origin requests
        // Don't log these as they're expected behavior for many NIP-05 servers
        this.nip05ValidationCache.set(cacheKey, {
          valid: false,
          timestamp: Date.now()
        });
        return false;
      }
    } catch (error) {
      // Handle any other errors silently (including CORS)
      // CORS errors are expected when servers don't allow cross-origin requests
      this.nip05ValidationCache.set(cacheKey, {
        valid: false,
        timestamp: Date.now()
      });
      return false;
    }
  }

  /**
   * Clear validation cache (useful for testing or manual refresh)
   */
  static clearValidationCache(): void {
    this.nip05ValidationCache.clear();
  }
}

