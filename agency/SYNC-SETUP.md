# Cloud sync setup (always-up-to-date data on every device)

By default the dashboard stores data in your browser only. Connect a small
database once and it becomes shared across every device, always current — the
badge in the top bar flips from **● Local only** to **☁ Synced** so you always
know which mode you're in.

There is exactly **one** thing that can't be automated for you: creating the
database and connecting it (it puts a secret token into the project, which only
you can do from the Vercel dashboard). It's about 5 clicks. Here's the whole thing.

## 1. Deploy the dashboard (once)

From `agency/` on your laptop:

```bash
npm install -g vercel   # if you don't have it
npm run app:deploy      # builds dashboard-app/ and deploys it
```

The first run asks you to log in and link/create a project — accept the
defaults. Note the URL it prints; that's your dashboard. New projects on your
team already have **Deployment Protection** on (only you, logged into Vercel,
can open it), so it's private by default.

## 2. Create a KV store and connect it

In the Vercel dashboard:

1. **Storage** → **Create Database** → choose **KV** (Upstash Redis) → give it
   a name → **Create**.
2. On the store's page → **Connect Project** → pick your dashboard project.
   This automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the
   project's environment variables (server-side only — never sent to browsers).
3. Redeploy so the function picks them up: `npm run app:deploy` again (or click
   **Redeploy** on the project in the Vercel dashboard).

Open the dashboard now — the badge should read **☁ Synced**. That's it for the
browser side: statuses, notes, follow-ups and manually-added leads now sync
across every device you open the URL on (log in to Vercel once per device).

## 3. Let the pipeline push leads to the cloud

So that `npm run discover`/`audit` results show up online, give the push script
the same two credentials **locally** (never committed):

1. On the KV store's page, open the **`.env.local`** tab — it lists
   `KV_REST_API_URL=...` and `KV_REST_API_TOKEN=...`.
2. Paste both lines into a new file `agency/.env.local` (this file is
   gitignored — it stays on your machine).

Now your weekly loop is:

```bash
npm run discover          # + npm run audit on the town you're working
npm run push              # sends leads to the cloud store
# open your dashboard URL on any device -> new leads are already there
```

## Notes

- **Security:** the KV token lives only in the Vercel project's server-side env
  and in your local `.env.local`. It is never in the deployed HTML/JS, never in
  git, and the whole deployment (page + API) sits behind your Vercel login.
- **Merge safety:** edits from different devices merge per-lead by timestamp, so
  two devices editing different leads never clobber each other; the pipeline's
  lead pushes never touch your statuses/notes.
- **Offline:** if the cloud is briefly unreachable the badge shows
  **⚠ Sync error** and your edits stay cached in the browser; they sync up on
  the next successful call.
- **`agency-sync-probe`** is a throwaway project used to verify the function
  deploys — you can delete it from the Vercel dashboard.
