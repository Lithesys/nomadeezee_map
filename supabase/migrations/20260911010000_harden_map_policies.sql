-- Keep every exposed function deterministic and prevent search_path hijacking.
alter function public.set_map_updated_at() set search_path = public, extensions, pg_temp;
alter function public.is_map_admin() set search_path = public, extensions, pg_temp;
alter function public.request_map_publish(uuid, uuid, uuid) set search_path = public, extensions, pg_temp;
alter function public.save_map_feature_draft(uuid, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid) set search_path = public, extensions, pg_temp;
alter function public.mark_map_release_ready(uuid, uuid) set search_path = public, extensions, pg_temp;
alter function public.activate_map_release(uuid, integer, uuid) set search_path = public, extensions, pg_temp;
alter function public.rollback_map_release(uuid, integer, uuid) set search_path = public, extensions, pg_temp;
alter function public.mark_map_publish_failed(uuid, text, text) set search_path = public, extensions, pg_temp;

-- Public readers use one SELECT policy; admin write policies do not create a
-- second permissive SELECT branch for the same role.
drop policy if exists "published features are public" on public.map_features;
drop policy if exists "admins manage map features" on public.map_features;
create policy "published features are public" on public.map_features
  for select to anon, authenticated
  using (status = 'published' or public.is_map_admin());
create policy "admins insert map features" on public.map_features
  for insert to authenticated with check (public.is_map_admin());
create policy "admins update map features" on public.map_features
  for update to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins delete map features" on public.map_features
  for delete to authenticated using (public.is_map_admin());

drop policy if exists "admins read releases" on public.map_releases;
drop policy if exists "admins manage releases" on public.map_releases;
drop policy if exists "active releases are public" on public.map_releases;
create policy "active releases are public" on public.map_releases
  for select to anon, authenticated
  using (status = 'active' or public.is_map_admin());
create policy "admins insert releases" on public.map_releases
  for insert to authenticated with check (public.is_map_admin());
create policy "admins update releases" on public.map_releases
  for update to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins delete releases" on public.map_releases
  for delete to authenticated using (public.is_map_admin());

drop policy if exists "admins read release features" on public.map_release_features;
drop policy if exists "admins manage release features" on public.map_release_features;
create policy "admins manage release features" on public.map_release_features
  for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());

drop policy if exists "admins read jobs" on public.map_publish_jobs;
drop policy if exists "admins manage jobs" on public.map_publish_jobs;
create policy "admins manage jobs" on public.map_publish_jobs
  for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());

drop policy if exists "admins manage channel" on public.map_channel;
create policy "admins write channel" on public.map_channel
  for update to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
