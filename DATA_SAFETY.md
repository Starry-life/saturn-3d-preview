# Data Safety

The website code and the graduation data are separated.

- GitHub Pages stores only the frontend code.
- Supabase stores uploaded photos, replaced photos, view counts, music settings, and activity logs.

Updating the website should not delete photos as long as the Supabase project is not deleted and destructive SQL is not run.

## Before Any Future Upgrade

1. Open the website.
2. Go to the album page.
3. Click `下载数据备份`.
4. Enter the records code `5708481`.
5. Keep the downloaded `graduation-star-atlas-backup-YYYY-MM-DD.json`.

## Never Run These In Supabase

Do not run SQL containing:

- `drop table photos`
- `drop table activity_logs`
- `drop table app_settings`
- `delete from photos`
- `truncate photos`
- `delete from storage.objects`

## Recommended Supabase Patch

Run `supabase-hardening.sql` once in Supabase SQL Editor. It:

- Revokes anonymous delete permissions.
- Adds an atomic `increment_photo_view` function so view counts are safer during concurrent visits.

## Rollback Code Without Losing Data

If a new frontend version has a bug:

1. Open GitHub -> Actions.
2. Pick the last successful deployment before the bug.
3. Revert the commit or push a fix.

Do not delete or recreate the Supabase project. The data stays there while the frontend is repaired.
