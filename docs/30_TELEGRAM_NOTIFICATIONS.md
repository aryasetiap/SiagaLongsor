# Telegram risk notifications

This guide configures outbound Telegram messages for authoritative SiagaLongsor risk transitions.
Telegram is an additional notification channel; it does not replace the dashboard, field
verification, or an official emergency procedure.

## 1. Behavior

The backend creates one notification when current server risk changes:

- internal `SAFE`: **AMAN**, di luar tingkat peringatan;
- internal `WATCH`: **WASPADA (TINGKAT 1)**;
- internal `WARNING`: **SIAGA (TINGKAT 2)**;
- internal `DANGER`: **AWAS (TINGKAT 3)**;
- any known state -> `UNKNOWN`: monitoring data unavailable or untrusted, never safe;
- any transition between known states uses Aman followed by the public Waspada–Siaga–Awas
  warning terminology.

`WARNING` is added to the server/database enum using an additive migration. It must not be shown to
operators as the public warning name. `UNKNOWN` is an operational data-quality/connectivity state,
not a warning level and never means Aman.

Repeated telemetry with the same current status, exact duplicate telemetry, and late historical
telemetry do not create additional messages. Risk calculation remains server-side and unchanged.

Every message includes the level, site/monitoring point, local timestamp, reasons, latest sensor
snapshot, recommended response, dashboard link, and event ID. An Awas message directs recipients
to contact the local preparedness team/authority and follow the approved evacuation command. The
Telegram bot itself does not issue an autonomous legal evacuation order.

Threshold values remain site-specific and must be based on investigation, calibration, and an
approved local procedure. SNI 9021:2021 is not treated as a universal numeric threshold table.
See [SNI status alignment](32_SNI_9021_STATUS_ALIGNMENT.md).

## 2. Create a bot with BotFather

1. In Telegram, open the verified `@BotFather` account.
2. Send `/newbot`.
3. Enter a display name, for example `SiagaLongsor SMAN 17`.
4. Enter a unique username ending in `bot`, for example `siagalongsor_sman17_bot`.
5. BotFather returns a bot token. Treat it like a password. Do not paste it into source code, chat,
   screenshots, firmware `secrets.h`, or a `NEXT_PUBLIC_*` variable.
6. If a token is exposed, use BotFather's `/revoke` command and deploy the replacement immediately.

## 3. Add the bot to a destination

For a group:

1. Create or open the operator group.
2. Add the bot as a member and allow it to send messages.
3. Send a command addressed to the bot, such as `/start@siagalongsor_sman17_bot`. A command remains
   visible to a bot when Telegram group privacy mode is enabled.

For a channel, add the bot as an administrator with permission to post messages. A public channel
can use `@channel_username` as `TELEGRAM_CHAT_ID`; a private channel/group uses its numeric ID.

## 4. Verify the token and obtain the chat ID with PowerShell

Read the token without placing the literal token in PowerShell command history:

```powershell
$secureToken = Read-Host 'Telegram bot token' -AsSecureString
$token = [System.Net.NetworkCredential]::new('', $secureToken).Password

$bot = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe"
$bot.result | Format-List id, username, first_name
```

After sending a command in the destination group, obtain its chat information:

```powershell
$updates = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getUpdates"
$chats = foreach ($update in $updates.result) {
  if ($null -ne $update.message) { $update.message.chat }
  if ($null -ne $update.channel_post) { $update.channel_post.chat }
}
$chats | Sort-Object id -Unique | Format-Table id, type, title, username -AutoSize
```

Group and supergroup IDs are normally negative, often beginning with `-100`. Copy the exact value,
including its minus sign. If the result is empty, send another command to the bot and repeat. A bot
configured with an incoming webhook cannot use `getUpdates`; a newly created outbound-only bot does
not normally have a webhook.

If the group uses forum topics, inspect the update containing the desired topic and copy its
`message_thread_id`:

```powershell
$updates.result | ConvertTo-Json -Depth 10
```

Leave `TELEGRAM_MESSAGE_THREAD_ID` empty for an ordinary group or the main chat.

## 5. Send a direct setup test

This verifies Telegram independently of SiagaLongsor:

```powershell
$chatId = Read-Host 'Telegram chat ID'
$testBody = @{
  chat_id = $chatId
  text = 'Uji koneksi bot SiagaLongsor berhasil.'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.telegram.org/bot$token/sendMessage" `
  -ContentType 'application/json' `
  -Body $testBody

Remove-Variable token, secureToken, testBody
```

The Bot API response must contain `ok: true`. Telegram documents `getUpdates` and `sendMessage` at
<https://core.telegram.org/bots/api>.

## 6. Configure SiagaLongsor

Add these values to the backend environment (`.env` locally or the production secret manager):

```env
TELEGRAM_NOTIFICATIONS_ENABLED=true
TELEGRAM_BOT_TOKEN=replace-with-the-real-secret-token
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_MESSAGE_THREAD_ID=
TELEGRAM_DASHBOARD_URL=https://siagalongsor.net/overview
```

Do not add the real values to `.env.example`. The token belongs only to the backend process. It is
not an ESP32 credential and no firmware rebuild is required.

Apply the migration and restart the API:

```powershell
cd D:\pakrismi\SiagaLongsor
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy
corepack pnpm --filter @siagalongsor/api build
```

Restart the production API using the hosting platform's normal deployment procedure. Local
development can use:

```powershell
corepack pnpm --filter @siagalongsor/api dev
```

No Telegram message is sent merely because the API starts. Create a controlled telemetry scenario
that changes the authoritative status, or wait for a real transition. This prevents misleading
startup alarms.

## 7. Diagnose delivery

Inspect recent outbox rows without exposing the bot token:

```sql
SELECT "createdAt", "status", "attemptCount", "lastErrorCode", "lastErrorMessage", "sentAt"
FROM "NotificationOutbox"
ORDER BY "createdAt" DESC
LIMIT 20;
```

Common results:

- `TELEGRAM_400`: chat ID, topic ID, or message destination is invalid;
- `TELEGRAM_401`: bot token is invalid or revoked;
- `TELEGRAM_403`: bot was removed, blocked, or lacks permission to post;
- `TELEGRAM_429`: Telegram rate limit; the worker automatically respects `retry_after`;
- `TELEGRAM_NETWORK_ERROR`: DNS, TLS, firewall, or outbound internet failure; the worker retries.

The worker retries network errors, HTTP `408`, `429`, and `5xx` up to eight attempts. Telegram
failure does not reject telemetry or alter the dashboard risk state.

To stop new messages safely, set `TELEGRAM_NOTIFICATIONS_ENABLED=false` and restart the API. Do not
delete telemetry or audit records.
