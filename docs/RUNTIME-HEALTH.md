# Hengs Discord Runtime Health Contract

Version: 1  
Producer: Hengs Discord v1.9.0+

## Purpose

Hengs writes a local read-only health snapshot to `data/runtime-health.json` every
30 seconds. Another local process may read this file to determine whether the Discord
bot is connected, reconnecting, stopped, failed, or stale. The producer does not send
commands and the consumer must not write to this file.

`HENGS_RUNTIME_HEALTH_FILE` may override the local path. The file must remain outside
public or web-served directories.

## Schema

```json
{
  "schemaVersion": 1,
  "service": "hengs-discord",
  "version": "1.9.0",
  "status": "connected",
  "online": true,
  "processStartedAt": "2026-08-09T00:00:00.000Z",
  "updatedAt": "2026-08-09T00:01:00.000Z",
  "uptimeSeconds": 60,
  "staleAfterMs": 90000,
  "connection": {
    "status": "CONNECTED",
    "at": "2026-08-09T00:00:02.000Z"
  },
  "heartbeat": {
    "status": "ALIVE",
    "at": "2026-08-09T00:01:00.000Z"
  },
  "lastIssue": null
}
```

Connection status is one of `STARTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`,
`DEGRADED`, `INVALIDATED`, `STOPPING`, `STOPPED`, or `FAILED`.

`lastIssue`, when present, contains only an allowlisted code and timestamp. Current
codes are `CLIENT_ERROR`, `GATEWAY_ERROR`, `LOGIN_FAILED`, `SESSION_INVALIDATED`,
`UNCAUGHT_EXCEPTION`, and `UNHANDLED_REJECTION`.

## Consumer Rules

1. Require `schemaVersion: 1` and `service: hengs-discord`.
2. Treat the bot as online only when `connection.status` is `CONNECTED` and
   `heartbeat.at` is no older than `staleAfterMs`.
3. Fail closed when timestamps are missing, invalid, more than five minutes in the
   future, or older than the stale limit.
4. `online` is a convenience field, not a substitute for the consumer freshness check.
5. Never infer Discord availability from the existence of the source folder or lock file.

## Write and Privacy Guarantees

- The producer writes a sibling temporary file, flushes it, then atomically renames it.
- A hard process kill may leave the last `CONNECTED` snapshot behind; freshness is the
  required crash detector.
- Snapshot write failure is isolated from the bot and retried on the next heartbeat.
- The file contains no token, API key, guild/channel/user ID, guild name, message,
  document, draft, path, raw exception, or stack trace.
- Runtime data remains under the ignored `data/` directory and must not be committed.
