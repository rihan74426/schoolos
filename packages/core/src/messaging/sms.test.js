import { describe, expect, it } from 'vitest';
import { DEFAULT_ABSENCE_TEMPLATES, messagingChannelInputSchema, renderTemplate, smsSegments } from './sms.js';

describe('smsSegments', () => {
  it('counts GSM-7 at 160 / 153', () => {
    expect(smsSegments('')).toMatchObject({ segments: 0 });
    expect(smsSegments('a'.repeat(160))).toMatchObject({ encoding: 'GSM7', segments: 1 });
    expect(smsSegments('a'.repeat(161))).toMatchObject({ segments: 2 });
    expect(smsSegments('a'.repeat(306))).toMatchObject({ segments: 2 });
    expect(smsSegments('a'.repeat(307))).toMatchObject({ segments: 3 });
  });
  it('counts extension characters twice', () => {
    expect(smsSegments('€')).toMatchObject({ encoding: 'GSM7', length: 2 });
    expect(smsSegments('{'.repeat(81))).toMatchObject({ segments: 2 });
  });
  it('switches to Unicode for Bangla at 70 / 67', () => {
    expect(smsSegments('আ'.repeat(70))).toMatchObject({ encoding: 'UNICODE', segments: 1 });
    expect(smsSegments('আ'.repeat(71))).toMatchObject({ segments: 2 });
    expect(smsSegments('আ'.repeat(135))).toMatchObject({ segments: 3 });
  });
});

describe('renderTemplate', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(renderTemplate(DEFAULT_ABSENCE_TEMPLATES.en, { student: 'Abu Bakr', school: 'Nur Madrasa', date: '2026-11-20' })).toBe(
      'Dear guardian, Abu Bakr was absent from Nur Madrasa on 2026-11-20.',
    );
    expect(renderTemplate('Hi {who} {x}', { who: 'A' })).toBe('Hi A {x}');
  });
  it('strips control characters from values', () => {
    expect(renderTemplate('{a}', { a: 'x\u0000y\u0007z' })).toBe('x y z');
  });
});

describe('messagingChannelInputSchema', () => {
  it('accepts a provider with optional key and sender id', () => {
    expect(messagingChannelInputSchema.safeParse({ kind: 'SMS', provider: 'SMS_NET_BD', senderId: 'NurSchool', apiKey: 'abcdefgh1234' }).success).toBe(true);
    expect(messagingChannelInputSchema.safeParse({ kind: 'SMS', provider: 'FAKE' }).success).toBe(true);
  });
  it('rejects unknown providers, short keys, odd sender ids and WhatsApp for now', () => {
    expect(messagingChannelInputSchema.safeParse({ kind: 'SMS', provider: 'TWILIO' }).success).toBe(false);
    expect(messagingChannelInputSchema.safeParse({ kind: 'SMS', provider: 'SMS_NET_BD', apiKey: 'short' }).success).toBe(false);
    expect(messagingChannelInputSchema.safeParse({ kind: 'SMS', provider: 'FAKE', senderId: 'bad<id>' }).success).toBe(false);
    expect(messagingChannelInputSchema.safeParse({ kind: 'WHATSAPP', provider: 'FAKE' }).success).toBe(false);
  });
});
