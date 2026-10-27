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
bucket, the engagement ledger (`news_views`, `news_saved_articles`,
`news_short_reactions`) with the view/save/reaction RPCs, and the comments +
moderation layer (`news_comments`, `news_reports`) with its RPCs. It must be
run after `schema.sql` because it references `profiles`.

Re-running is safe: functions are replaced and policies are dropped before
being recreated. Do not run an older copy of this file — the app calls the
9-argument `news_article_feed` RPC, the engagement RPCs
`news_register_view`, `news_toggle_saved_article` and
`news_toggle_short_reaction`, and the comment/moderation RPCs listed below.

If the live site was opened before this section was applied, saves and
reactions fall back to session-only state, and comments show an “apply the
latest schema” note. Re-run the whole file once, then reload the app.

### Comment moderation

Comments and reports are written through definer RPCs only. The public
nickname/avatar card is limited to those two fields, so the friend-only
`profiles` table never opens to strangers.

To give an account access to the moderation desk, run this once in the SQL
Editor with the account's real auth user id:

```sql
insert into public.news_admins (user_id)
values ('<auth-user-id>')
on conflict do nothing;
```

The **Moderation** section appears in **News → Settings** only for accounts in
`news_admins`. Moderators can hide/remove a reported comment, take down an
article/Flash/Short, archive a channel, or dismiss a report. Every action is
written to `news_audit_log`.

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

Engagement:

1. `news_views`, `news_saved_articles` and `news_short_reactions` must answer
   `200` with the anon key (they return `[]` for an anonymous reader because of
   RLS). A `404` means section 14 has not been applied.
2. Open a published story, close it, and open it again on the same day. The
   reader's view counter should increase once, not twice.
3. Save the story. **Settings → Saved stories** should list it, including after
   a reload.
4. Like and save a Short. Both states should survive a reload, and the like
   counter should move by exactly one.

Comments and moderation:

1. `news_comments` and `news_reports` must answer `200` with the anon key (they
   return `[]` or a permission error because access is RPC-only). A `404` means
   section 15 has not been applied.
2. Open a published article and post a comment. It should appear immediately
   and survive a reload.
3. Reply to that comment. The reply should be one level deep under the root.
4. Delete your own comment. The row disappears; a root with replies becomes
   “Comment removed”.
5. Report the comment. A moderator account should see it in **Settings →
   Moderation → Reports queue**. Hide it, then reload the article: it must be
   gone. Dismissing a report must not hide the target.
6. Reporting the same target twice from one account must return the existing
   open report instead of creating a duplicate.

Friends:

1. Create an account on device A.
2. Create another account on device B.
3. Search for B on A → **Add friend**.
4. On B: Profile → **Requests** → **Accept**.
5. Both profiles should show each other under **Friends**, and the profile tab
   badge should clear.
