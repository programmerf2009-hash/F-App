# F App — Supabase setup

## 1. Run the schema

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

## 2. Auth settings

Go to **Authentication → Sign In / Providers → Email**:

- **Enable email provider**: on
- **Confirm email**: off
- **Allow new users to sign up**: on

The app uses a synthetic address: `<nickname>@fapp.app`. No real email is sent.

## 3. Environment variables

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

## 4. Storage notes

- Avatars are public: `avatars/<userId>/avatar-<timestamp>.jpg`
- Songs are private: `songs/<userId>/song-<timestamp>.<ext>`
- Post media: `posts/<userId>/<postId>/<file>`
- Story media: `stories/<userId>/<storyId>/<file>`
- Friends read a private song through a signed URL; strangers cannot.

## 5. Verify

After running the schema:

1. Create an account on device A.
2. Create another account on device B.
3. Search for B on A → **Add friend**.
4. On B: Profile → **Requests** → **Accept**.
5. Both profiles should show each other under **Friends**, and the profile tab
   badge should clear.
