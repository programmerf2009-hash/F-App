# F App — Supabase setup

## 1. Run the base schema

1. Open the Supabase project.
2. Go to **SQL Editor → New query**.
3. Open [`schema.sql`](./schema.sql) and copy the **entire** file.
4. Paste it into the editor and press **Run**.
5. The result should be `Success. No rows returned`.

The script creates:

- `profiles`, `friendships`, `posts`, `stories`
- RLS policies and private/public profile rules
- search, profile, friend-list and friend-request RPCs
- `avatars` (public) and `media` (private) storage buckets
- realtime on `friendships`

It is safe to run again if you need to update policies.

## 2. Run the News schema

Do this **after** step 1, in the same SQL Editor:

1. Open [`news-schema.sql`](./news-schema.sql) and copy the **entire** file.
2. Paste it into a new query and press **Run**.
3. The result should be `Success. No rows returned`.

The News script is additive; it creates the `news_*` tables, RLS policies,
feed/search RPCs, verification and transfer rules, the public `news-media`
bucket, and the engagement ledger (`news_views`, `news_saved_articles`,
`news_short_reactions`) with the view/save/reaction RPCs. It must be run after
`schema.sql` because it references `profiles`.

Re-running is safe: functions are replaced and policies are dropped before
being recreated. Do not run an older copy of this file — the app calls the
9-argument `news_article_feed` RPC and the engagement RPCs
`news_register_view`, `news_toggle_saved_article` and
`news_toggle_short_reaction`.

If the live site was opened before this section was applied, saves and
reactions fall back to session-only state. Re-run the whole file once, then
reload the app: view counts, saved stories and Short likes become persistent.

## 3. Auth settings

Go to **Authentication → Sign In / Providers → Email**:

- **Enable email provider**: on
- **Confirm email**: off
- **Allow new users to sign up**: on

The app uses a synthetic address: `<nickname>@fapp.app`. No real email is sent.

## 4. Environment variables

Local development — create `.env.local` in the repo root:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

GitHub Actions — add both as repository secrets:

```bash
gh secret set VITE_SUPABASE_URL
gh secret set VITE_SUPABASE_ANON_KEY
```

The publishable/anon key is safe to expose. Never put a `service_role` key in
the web app.

## 5. Storage notes

- Avatars are public: `avatars/<userId>/avatar-<timestamp>.jpg`
- Songs are private: `songs/<userId>/song-<timestamp>.<ext>`
- Post media: `posts/<userId>/<postId>/<file>`
- Story media: `stories/<userId>/<storyId>/<file>`
- Friends read a private song through a signed URL; strangers cannot.
- News covers and media go to the public `news-media` bucket.

## 6. Verify

News data layer:

1. Open `https://<project-ref>.supabase.co/rest/v1/news_channels?select=id&limit=1`
   with the anon key. It must answer `200` (an empty array is fine), not `404`.
2. Reload the app. The News masthead should switch from `PREVIEW EDITION` to
   `LIVE EDITION`.

Friends:

1. Create an account on device A.
2. Create another account on device B.
3. Search for B on A → **Add friend**.
4. On B: Profile → **Requests** → **Accept**.
5. Both profiles should show each other under **Friends**, and the profile tab
   badge should clear.
