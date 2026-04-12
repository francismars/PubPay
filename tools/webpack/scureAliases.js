/**
 * Resolve @scure/bip32 and @scure/bip39 for webpack. These are direct deps of
 * @pubpay/shared-services but must also be installed on each app that bundles
 * it (pnpm isolation). We try several roots so resolution works from any app.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

const searchRoots = [
  path.join(repoRoot, 'apps/pubpay'),
  path.join(repoRoot, 'apps/live'),
  path.join(repoRoot, 'apps/jukebox'),
  path.join(repoRoot, 'packages/shared-services'),
  repoRoot
];

function resolvePkgDir(name) {
  let dir = path.dirname(
    require.resolve(name, {
      paths: searchRoots
    })
  );
  for (let i = 0; i < 8; i++) {
    const pkgJson = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (pkg.name === name) {
          return dir;
        }
      } catch (_) {
        /* continue */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Could not resolve package root for "${name}"`);
}

function scureAliases() {
  return {
    '@scure/bip32': resolvePkgDir('@scure/bip32'),
    '@scure/bip39': resolvePkgDir('@scure/bip39'),
    '@scure/bip39/wordlists/english': require.resolve(
      '@scure/bip39/wordlists/english',
      { paths: searchRoots }
    )
  };
}

module.exports = { scureAliases };
