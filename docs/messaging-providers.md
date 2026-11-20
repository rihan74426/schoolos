# Messaging providers (Slice 4 decision input)

Channel order proposed: in-app/push later; **SMS** (reliable for guardians) + **WhatsApp** (cheap/rich, needs opt-in + templates).

## SMS (Bangladesh)
- BTRC: A2P SMS must go via a BTRC-listed aggregator. Masking (brand sender) is for transactional/service messages; non-masking numeric is the promo route with NDNC filtering and 9am-9pm limits. Confirm school notices count as transactional with the provider.
- Bangla = Unicode: 70 chars/segment (160 for English). Budget segments.
- Standard A2P is one-way.
- Candidates (verify BTRC status, API docs, price, delivery receipts): sms.net.bd, MiMSMS, Swift SMS Sender, ServerBD; also commonly used locally (unverified here): BulkSMSBD, Alpha SMS, GreenWeb, ADN SMS, SSL Wireless; operator direct: Grameenphone, Robi, Banglalink, Teletalk. International fallback: Twilio, Plivo (far costlier per message).

## WhatsApp
- Official WhatsApp Business Platform (Cloud API). Meta bills per delivered template message by category (marketing/utility/authentication), Bangladesh is its own market (+880). Utility messages in an open 24h window are no longer free (since 2026-10-01). Check the rate card for BD rates.
- Needs a Meta business account, approved templates, and guardian opt-in. Absence alerts = utility template.
- Share-link flows (wa.me) need no API but are manual; fine for invites, not for bulk alerts.

## Adapter plan
`NotificationJob` -> provider adapter interface (`send`, `status`) -> fake provider (tests) + SMS adapter + WhatsApp adapter. Idempotency key per job; delivery log screen; failure never blocks attendance.
Test delivery receipts with two SMS providers before choosing.

## Founder-supplied provider (decision 2026-11-20)
Founders pick a provider and paste their own API credentials in Settings; SchoolOS ships adapters, not a single vendor. Billing and sender-ID approval stay between school and provider.

- Model `MessagingChannel` (tenant-scoped): `institutionId`, `kind` (`SMS`|`WHATSAPP`), `provider` (`SMS_NET_BD`|`CUSTOM_HTTP`|`FAKE`|...), `senderId`, `credentialsEnc`, `active`, `lastTestAt`, `lastTestOk`. One active channel per kind per institution (partial unique index).
- Credentials: encrypt at rest (AES-256-GCM, master key from env, key id stored for rotation). Never log, audit or return them to the client after save (show last 4 chars only). Edits write an `AuditEvent` without secrets. Permission `settings:write` (founder/principal only).
- Adapter interface: `send({to, text, idempotencyKey}) -> {providerId}`, `status(providerId) -> per-recipient state`, `balance()`. Core owns Bangla/Unicode segment counting and phone normalization; adapters only map HTTP.
- First adapter: sms.net.bd (`https://api.sms.net.bd`). Docs: `api_key` param; `POST /sendsms` (`msg`, `to`, optional `sender_id`, `schedule`, `content_id`); `GET /user/balance/`; `GET /report/request/{id}/`; JSON `{error, msg, data}`, `error:0` = ok (417 insufficient balance, 413 invalid sender ID). No webhooks, so delivery status needs a polling job. Bulk = comma-separated `to` and needs `content_id` (campaign SMS only), so per-guardian alerts send individually.
- `CUSTOM_HTTP` adapter (URL template + headers + body mapping) only after the SSRF guard exists: allowlist https, block private/loopback IPs, timeouts. Otherwise a founder-supplied URL can hit our internal network. Ship named adapters first.
- "Test connection" button: balance check plus a test SMS to the founder's own number; store result.
- Failures surface in the delivery log; attendance never waits on SMS.
