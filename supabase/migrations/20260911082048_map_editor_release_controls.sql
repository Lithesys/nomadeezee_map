-- Complete the editorial control loop and keep foreign-key lookups cheap.

create index if not exists map_activation_events_actor_id_idx
  on public.map_activation_events(actor_id);
create index if not exists map_activation_events_from_release_id_idx
  on public.map_activation_events(from_release_id);
create index if not exists map_activation_events_to_release_id_idx
  on public.map_activation_events(to_release_id);
create index if not exists map_channel_active_release_id_idx
  on public.map_channel(active_release_id);
create index if not exists map_channel_updated_by_idx
  on public.map_channel(updated_by);
create index if not exists map_feature_revisions_created_by_idx
  on public.map_feature_revisions(created_by);
create index if not exists map_features_created_by_idx
  on public.map_features(created_by);
create index if not exists map_features_updated_by_idx
  on public.map_features(updated_by);
create index if not exists map_publish_jobs_requested_by_idx
  on public.map_publish_jobs(requested_by);
create index if not exists map_release_features_feature_id_idx
  on public.map_release_features(feature_id);
create index if not exists map_release_features_revision_id_idx
  on public.map_release_features(revision_id);
create index if not exists map_releases_created_by_idx
  on public.map_releases(created_by);
create index if not exists map_releases_parent_release_id_idx
  on public.map_releases(parent_release_id);

-- The automatic RLS event trigger is an internal migration helper, not an API.
-- Keep it out of the exposed function surface.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create or replace function public.get_map_feature_editor(p_feature_id uuid)
returns jsonb
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', f.id,
    'feature_type', f.feature_type,
    'name', f.name,
    'name_vi', f.name_vi,
    'name_en', f.name_en,
    'slug', f.slug,
    'geometry', case when f.geometry is null then null else extensions.st_asgeojson(f.geometry)::jsonb end,
    'label_point', case when f.label_point is null then null else extensions.st_asgeojson(f.label_point)::jsonb end,
    'min_zoom', f.min_zoom,
    'max_zoom', f.max_zoom,
    'label_min_zoom', f.label_min_zoom,
    'label_priority', f.label_priority,
    'source', f.source,
    'source_id', f.source_id,
    'status', f.status,
    'version', f.version,
    'latest_revision_id', (
      select r.id
      from public.map_feature_revisions r
      where r.feature_id = f.id
      order by r.version desc
      limit 1
    ),
    'created_at', f.created_at,
    'updated_at', f.updated_at
  )
  from public.map_features f
  where f.id = p_feature_id
    and (f.status = 'published' or public.is_map_admin());
$$;

create or replace function public.revert_map_feature_revision(
  p_feature_id uuid,
  p_revision_id uuid,
  p_updated_by uuid
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  feature_row public.map_features%rowtype;
  source_revision public.map_feature_revisions%rowtype;
  next_revision_id uuid;
  next_version integer;
begin
  if not public.is_map_admin() or auth.uid() <> p_updated_by then
    raise exception 'map admin role required';
  end if;

  select * into feature_row
  from public.map_features
  where id = p_feature_id
  for update;
  if feature_row.id is null then
    raise exception 'feature not found';
  end if;

  select * into source_revision
  from public.map_feature_revisions
  where id = p_revision_id and feature_id = p_feature_id;
  if source_revision.id is null then
    raise exception 'revision does not belong to feature';
  end if;
  if source_revision.status = 'archived' then
    raise exception 'archived revision cannot be restored';
  end if;

  next_version := feature_row.version + 1;
  insert into public.map_feature_revisions(
    feature_id, geometry, label_point, name, name_vi, name_en,
    min_zoom, max_zoom, label_min_zoom, label_priority,
    version, status, created_by
  ) values (
    p_feature_id, source_revision.geometry, source_revision.label_point,
    source_revision.name, source_revision.name_vi, source_revision.name_en,
    source_revision.min_zoom, source_revision.max_zoom,
    source_revision.label_min_zoom, source_revision.label_priority,
    next_version, 'draft', p_updated_by
  ) returning id into next_revision_id;

  update public.map_features
  set geometry = source_revision.geometry,
      label_point = source_revision.label_point,
      name = source_revision.name,
      name_vi = source_revision.name_vi,
      name_en = source_revision.name_en,
      min_zoom = source_revision.min_zoom,
      max_zoom = source_revision.max_zoom,
      label_min_zoom = source_revision.label_min_zoom,
      label_priority = source_revision.label_priority,
      version = next_version,
      status = 'draft',
      updated_by = p_updated_by
  where id = p_feature_id;

  return jsonb_build_object(
    'featureId', p_feature_id,
    'revisionId', next_revision_id,
    'version', next_version,
    'restoredFromRevisionId', p_revision_id
  );
end;
$$;

alter function public.get_map_feature_editor(uuid)
  set search_path = public, extensions, pg_temp;
alter function public.revert_map_feature_revision(uuid, uuid, uuid)
  set search_path = public, extensions, pg_temp;
