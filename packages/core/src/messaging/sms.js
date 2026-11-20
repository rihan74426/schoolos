import { z } from 'zod';

// GSM 03.38 basic set; extension chars cost 2 septets.
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXT = new Set('^{}\\[~]|€');

/** SMS cost estimate. Bangla (Unicode) = 70 chars/segment, 67 when split; GSM-7 = 160 / 153. */
export function smsSegments(text) {
  const value = String(text ?? '');
  let septets = 0;
  let gsm = true;
  for (const ch of value) {
    if (GSM_BASIC.has(ch)) septets += 1;
    else if (GSM_EXT.has(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: 'GSM7', length: septets, segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153) };
  }
  const units = value.length; // UTF-16 code units, as carriers count them
  return { encoding: 'UNICODE', length: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

export const DEFAULT_ABSENCE_TEMPLATES = {
  en: 'Dear guardian, {student} was absent from {school} on {date}.',
  bn: 'প্রিয় অভিভাবক, {student} {date} তারিখে {school}-এ অনুপস্থিত ছিল।',
};

/** Fills {placeholders}; unknown placeholders are left as-is, control characters removed. */
export function renderTemplate(template, vars) {
  return String(template)
    .replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole))
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .trim();
}

export const MESSAGING_PROVIDERS = ['FAKE', 'SMS_NET_BD'];

// Only SMS is wired today; WhatsApp joins this enum when its adapter ships.
export const messagingChannelInputSchema = z.object({
  kind: z.literal('SMS'),
  provider: z.enum(MESSAGING_PROVIDERS),
  senderId: z.string().trim().max(20).regex(/^[A-Za-z0-9 ._-]*$/, 'Letters, digits, space . _ - only').optional().default(''),
  // Omitted on edit = keep the stored key.
  apiKey: z.string().trim().min(8, 'API key looks too short').max(200).optional(),
});
