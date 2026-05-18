# ROOM_9 GitHub Repository Setup

Date: 2026-05-18

ROOM_9 is already initialized as a local Git repository. The current branch is `main`, and the latest local baseline commit is ready to push.

## Current Local State

- Local Git repository: ready.
- Branch: `main`.
- Remote: not connected yet.
- Secrets are not committed.
- `.env.local` must stay local and must not be pushed.

## Recommended Repository

Create a private GitHub repository:

```text
room-9
```

Recommended visibility while preparing the diploma:

```text
Private
```

## Option A: Create Empty Repo In GitHub UI

1. Open GitHub.
2. Create a new repository named `room-9`.
3. Keep it empty:
   - do not add README,
   - do not add `.gitignore`,
   - do not add license.
4. Copy the repository URL.
5. Run locally:

```bash
git remote add origin <repo-url>
git push -u origin main
```

## Option B: Use GitHub CLI

The local machine currently does not have `gh` installed. If GitHub CLI is installed and authenticated, the repo can be created with:

```bash
gh repo create room-9 --private --source=. --remote=origin --push
```

If the command fails with `command not found: gh`, install GitHub CLI first and authenticate:

```bash
brew install gh
gh auth login
```

## Cloudflare Git Deployment

After the GitHub repository exists, Cloudflare can deploy from GitHub.

Required GitHub Actions secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_ROOM9_DEMO_MODE
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The deployment workflow already exists in:

```text
.github/workflows/cloudflare-deploy.yml
```

## Security Notes

Never commit:

- `.env.local`
- Supabase service role keys
- Cloudflare API tokens
- database passwords
- private rider documents

Use only public/publishable Supabase keys in browser-exposed environment variables.
