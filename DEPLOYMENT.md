# Graduation Star Atlas Deployment

This project can run in two modes:

- Local Node server mode for temporary LAN/tunnel testing.
- GitHub Pages + Supabase mode for a long-term public URL with persistent uploads.

## 1. Create Supabase Project

1. Open Supabase and create a project.
2. Open SQL Editor.
3. Run `supabase-schema.sql` once.
4. Open Project Settings -> API.
5. Copy:
   - Project URL
   - anon public key

## 2. GitHub Secrets

In the GitHub repository, open Settings -> Secrets and variables -> Actions.

Add these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The bucket names are already fixed in the workflow:

- `graduation-photos`
- `graduation-music`

## 3. GitHub Pages

In the GitHub repository:

1. Open Settings -> Pages.
2. Set Source to GitHub Actions.
3. Push to `main`.
4. Wait for the Deploy GitHub Pages workflow to finish.

The final long-term URL will look like:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

## Notes

- Photo IDs stay permanent.
- Replacing a photo keeps the ID and resets views to 0.
- Top 10 by views become gold stars; 11-30 become silver-blue stars.
- Upload accounts are checked in the UI and constrained by Supabase policies.
- For strict anti-abuse security, move upload operations to Supabase Edge Functions later.
