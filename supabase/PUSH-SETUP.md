# News push notifications — setup

Web Push sends breaking alerts to readers who follow a channel and allowed
notifications on their device.

## 1. Database

Apply section 16 of `supabase/news-schema.sql` (`news_push_subscriptions`)
in the Supabase SQL editor. It adds the table, RLS policies and grants.

## 2. Edge Function

Deploy the sender:

```
supabase functions deploy news-push
```

The function must run with JWT verification off or on — it verifies the caller
itself. Environment secrets required:

| Secret              | Value                                   |
| ------------------- | --------------------------------------- |
| `VAPID_PUBLIC_KEY`  | see the client constant in `src/news/news-push.ts` |
| `VAPID_PRIVATE_KEY` | stored **only** in Supabase secrets     |
| `VAPID_SUBJECT`     | `mailto:admin@fapp.app`                 |

Set them with:

```
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@fapp.app
```

or through the dashboard: Project → Edge Functions → Secrets.

**Never commit the private key.** This repository is public; the private key
lives only in the Supabase project secrets. Rotating it means regenerating the
pair (`npx web-push generate-vapid-keys`), updating the client constant and
the two secrets; existing subscriptions keep working because endpoints are
not tied to the VAPID key.

## 3. How it is used

- Settings → **Device notifications** asks for browser permission and stores
  the endpoint for the signed-in reader.
- Publishing an urgent article or a Flash from Studio calls
  `supabase.functions.invoke("news-push", { channelId, title })`.
- The function allows the channel owner and news admins, resolves that
  channel's followers, skips readers with `breaking_alerts = false`, and
  removes endpoints that return 404/410.

## 4. Testing

1. Enable notifications in Settings; a row appears in
   `news_push_subscriptions`.
2. Publish an urgent article from the test channel.
3. A system notification should appear even with the app in a background tab.
4. Clicking it focuses/opens the app at the alert URL.
