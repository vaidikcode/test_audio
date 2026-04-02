# test_audio

Compare audio samples (Supabase) with a Mirelo text-to-music flow. Local dev runs a Vite client and a small Express proxy; production can be a **single Vercel project** (static UI + serverless API).

## Local development

From the repo root:

```bash
npm install
cp client/.env.example client/.env
cp server/.env.example server/.env
# Fill in Supabase + MIRELO_API_KEY, then:
npm run dev
```

- Client: http://localhost:5173 (proxies `/api` to the server)
- Mirelo proxy: http://127.0.0.1:8788

## Deploy on Vercel (one project)

1. **Import the Git repo** and set the Vercel **Root Directory** to the **repository root** (not `client` and not `server`). Vercel will use `vercel.json` to build the client into `client/dist` and deploy `api/[[...path]].mjs` for all `/api/*` routes on the same domain.
2. **Environment variables** (Project → Settings → Environment Variables):
   - `MIRELO_API_KEY` — required for Mirelo proxy routes
   - `MIRELO_API_BASE_URL` — optional, default `https://api.mirelo.ai`
   - `VITE_SUPABASE_URL` — used at build time for the client
   - `VITE_SUPABASE_ANON_KEY` — used at build time for the client
3. Redeploy after changing env vars.

You do **not** need a second Vercel project for `./server`; the Express app is wrapped with `serverless-http` and invoked by the catch-all API route.

**Note:** Long-running Mirelo requests are limited by your Vercel plan’s function timeout. Adjust `functions` → `maxDuration` in `vercel.json` if your plan allows it.
