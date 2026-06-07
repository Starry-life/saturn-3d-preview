-- Optional hardening patch. Run this once in Supabase SQL Editor.
-- It is intentionally non-destructive: it only adds functions/policies and does not delete data.

revoke delete on table public.photos from anon;
revoke delete on table public.activity_logs from anon;
revoke delete on table public.app_settings from anon;

create or replace function public.increment_photo_view(photo_id bigint)
returns table (
  id bigint,
  src text,
  click_count integer,
  name text,
  uploader_account text,
  replaced_by text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.photos (id, src, click_count)
  values (
    photo_id,
    '',
    case
      when photo_id <= 10 then 4
      when photo_id <= 30 then 3
      else 2
    end
  )
  on conflict (id) do update
    set click_count = public.photos.click_count + 1,
        updated_at = now();

  return query
    select p.id, p.src, p.click_count, p.name, p.uploader_account, p.replaced_by, p.created_at, p.updated_at
    from public.photos p
    where p.id = photo_id;
end;
$$;

grant execute on function public.increment_photo_view(bigint) to anon;
