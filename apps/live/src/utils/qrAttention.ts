export type QrAttentionMode = '' | 'pulse' | 'shine' | 'spring';

export function normalizeQrAttention(value: unknown): QrAttentionMode {
  if (value === true || value === 'true') return 'pulse';
  if (value === 'pulse' || value === 'shine' || value === 'spring') return value;
  return '';
}

export function applyQrAttention(value: unknown) {
  const mode = normalizeQrAttention(value);
  if (mode) {
    document.body.dataset.qrAttention = mode;
  } else {
    delete document.body.dataset.qrAttention;
  }
  const select = document.getElementById(
    'qrAttentionSelect'
  ) as HTMLSelectElement | null;
  if (select && select.value !== mode) select.value = mode;
  return mode;
}
