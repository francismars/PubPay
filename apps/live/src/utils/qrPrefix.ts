const QR_PREFIX = /^(nostr:|lightning:|https:\/\/|http:\/\/)/i;

export function isQrPrefixStripped(): boolean {
  const toggle = document.getElementById(
    'qrStripPrefixToggle'
  ) as HTMLInputElement | null;
  return !!toggle?.checked;
}

export function stripQrPrefix(value: string, strip = isQrPrefixStripped()): string {
  if (!strip) return value;
  return value.replace(QR_PREFIX, '');
}

export function formatQrPreview(value: string, maxLength = 60): string {
  const text = stripQrPrefix(value).toUpperCase();
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}
