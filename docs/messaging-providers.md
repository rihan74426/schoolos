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
