# ROOM_9 Cloudflare Hosting Plan

ROOM_9 can be hosted permanently on Cloudflare Workers with the Cloudflare OpenNext adapter. The current local demo still runs on `localhost:3001`; Cloudflare is a deployment target, not a replacement for Supabase.

## Recommended Target

- **Runtime:** Cloudflare Workers
- **Next.js adapter:** `@opennextjs/cloudflare`
- **CLI:** Wrangler
- **Database/Auth/Storage:** Supabase stays external
- **Domain:** Cloudflare custom domain or `*.workers.dev`

This matches ROOM_9 because the app is a single Next.js modular monolith with public music pages, authenticated workspace pages, and Supabase-backed data.

## Required Cloudflare Setup

1. Create or log in to a Cloudflare account.
2. Add the production domain to Cloudflare if a custom domain is needed.
3. Create the Worker deployment through Wrangler or Cloudflare dashboard builds.
4. Add build variables/secrets:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   NEXT_PUBLIC_ROOM9_DEMO_MODE=false
   ```

5. Run the latest `supabase/schema.sql` in Supabase before first production testing.
6. Confirm Supabase Storage buckets exist:

   ```text
   tracks
   images
   documents
   ```

## Adapter Commands

The Cloudflare adapter is already installed in `devDependencies`:

```bash
npm install -D @opennextjs/cloudflare@latest wrangler@latest
```

Cloudflare scripts are available in `package.json`:

```json
{
  "scripts": {
    "cf:preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "cf:deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "cf:typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  }
}
```

`wrangler.jsonc` is already present:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "room-9",
  "compatibility_date": "2026-05-18",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  }
}
```

`open-next.config.ts` is already present:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
```

## Deployment Flow

### Local Deploy

1. Keep local work on port `3001`:

   ```bash
   npm run dev
   ```

2. Run local production checks:

   ```bash
   npm run lint
   npm run build
   ```

3. Preview the Cloudflare Worker runtime:

   ```bash
   npm run cf:preview
   ```

4. Deploy:

   ```bash
   npm run cf:deploy
   ```

5. Test the real domain:

   - Listener: Explore -> Track -> Save Moment -> Sound Vault
   - Organizer/Venue: Event Desk -> Booking Request -> Booking Case
   - DJ: Upload Track -> Public Dossier -> Rider -> Accept/Decline

## Important Notes

- Do not put `service_role` keys in the frontend or Cloudflare public variables.
- Supabase RLS remains the security boundary for user data.
- Audio files, covers, avatars, riders, and release media continue to live in Supabase Storage.
- Real live streaming can later use Cloudflare Stream, but the current MVP stream module is still a product UI/demo layer.
- The Cloudflare adapter should be installed only when we are ready to deploy, because it changes the deployment toolchain and adds generated files.

## Current Status

The project is Cloudflare-build-ready:

- `@opennextjs/cloudflare` is installed.
- `wrangler` is installed.
- `wrangler.jsonc` exists.
- `open-next.config.ts` exists.
- `npm run cf:build` passes locally.

The next deployment step requires a Cloudflare API token provided through the local environment, not committed to the repository:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
npm run cf:deploy
```

After deploying, rotate any token that was pasted into chat or shared outside a password manager.

## GitHub -> Cloudflare Flow

The repository now includes a GitHub Actions workflow:

```text
.github/workflows/cloudflare-deploy.yml
```

Use this when you want Cloudflare deployment to come from Git instead of a local terminal.

Required GitHub repository secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_ROOM9_DEMO_MODE
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Recommended process:

1. Push `main` to GitHub.
2. Add the secrets above in GitHub: Settings -> Secrets and variables -> Actions.
3. Push to `main` or run the workflow manually from the Actions tab.
4. Check the deployed Worker URL.

Do not commit `.env.local`, Cloudflare API tokens, Supabase secret keys, or service role keys.

## Cloudflare CPU Limit Fix

The previous demo audio endpoint generated WAV audio inside the Worker. That is too expensive for Cloudflare Workers and can produce:

```text
Worker exceeded CPU time limit.
```

ROOM_9 now serves demo audio as static files from:

```text
public/demo-audio/
```

The old compatibility route:

```text
/api/demo-audio/[id]
```

now performs a fast `308` redirect to the matching static WAV file for both `GET` and `HEAD`. This keeps old links working while preventing CPU-heavy audio generation at the edge.
