/**
 * NIP-06 key derivation (BIP39 mnemonic + path m/44'/1237'/account'/0/0).
 * Implemented with @scure/* directly so webpack/ts-loader resolve without
 * relying on the `nostr-tools/nip06` package export subpath.
 */
import { HDKey } from '@scure/bip32';
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const DERIVATION_BASE = "m/44'/1237'";

export function generateSeedWords(): string {
  return generateMnemonic(wordlist);
}

export function privateKeyFromSeedWords(
  mnemonic: string,
  passphrase = '',
  accountIndex = 0
): Uint8Array {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, passphrase));
  const privateKey = root.derive(
    `${DERIVATION_BASE}/${accountIndex}'/0/0`
  ).privateKey;
  if (!privateKey) {
    throw new Error('could not derive private key');
  }
  return privateKey;
}

export function validateWords(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}
