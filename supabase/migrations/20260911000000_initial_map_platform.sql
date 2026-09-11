create extension if not exists postgis with schema extensions;

create type public.map_feature_type as enum (
  'country', 'province', 'district', 'city', 'area', 'island', 'neighbourhood'
);
create type public.map_feature_status as enum ('draft', 'published', 'archived');
create type public.map_release_status as enum ('building', 'ready', 'active', 'failed', 'superseded');
create type public.map_publish_job_status as enum ('queued', 'building', 'uploading', 'verifying', 'succeeded', 'failed', 'superseded');

create table public.map_features (
  id uuid primary key default gen_random_uuid(),
  feature_type public.map_feature_type not null,
  name text not null check (char_length(name) between 1 and 200),
  name_vi text check (name_vi is null or char_length(name_vi) <= 200),
  name_en text check (name_en is null or char_length(name_en) <= 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  geometry extensions.geometry(MultiPolygon, 4326),
  label_point extensions.geometry(Point, 4326),
  min_zoom smallint not null default 0 check (min_zoom between 0 and 24),
  max_zoom smallint not null default 14 check (max_zoom between 0 and 24 and max_zoom >= min_zoom),
  label_min_zoom smallint not null default 5 check (label_min_zoom between 0 and 24),
  label_priority integer not null default 0 check (label_priority between -10000 and 10000),
  source text not null default 'nomadeezee',
  source_id text,
  status public.map_feature_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint map_features_geometry_valid check (geometry is null or extensions.st_isvalid(geometry)),
  constraint map_features_label_srid check (label_point is null or extensions.st_srid(label_point) = 4326)
);
create index map_features_type_status_idx on public.map_features(feature_type, status);
create index map_features_geometry_gist_idx on public.map_features using gist(geometry);

create table public.map_feature_revisions (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.map_features(id) on delete cascade,
  geometry extensions.geometry(MultiPolygon, 4326),
  label_point extensions.geometry(Point, 4326),
  name text not null check (char_length(name) between 1 and 200),
  name_vi text,
  name_en text,
  min_zoom smallint not null check (min_zoom between 0 and 24),
  max_zoom smallint not null check (max_zoom between min_zoom and 24),
  label_min_zoom smallint not null check (label_min_zoom between 0 and 24),
  label_priority integer not null check (label_priority between -10000 and 10000),
  version integer not null check (version > 0),
  status public.map_feature_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint map_feature_revisions_geometry_valid check (geometry is null or extensions.st_isvalid(geometry))
);
create index map_feature_revisions_feature_version_idx on public.map_feature_revisions(feature_id, version desc);

create table public.map_releases (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique,
  generation integer not null check (generation >= 0),
  parent_release_id uuid references public.map_releases(id),
  world_version text not null default 'world-v1',
  vietnam_version text not null default 'vietnam-v1',
  geo_version text not null,
  style_version text not null default 'plain-v1',
  glyphs_version text not null default 'glyphs-v1',
  status public.map_release_status not null default 'building',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  failure_reason text
);
create index map_releases_status_generation_idx on public.map_releases(status, generation desc);

create table public.map_release_features (
  release_id uuid not null references public.map_releases(id) on delete cascade,
  feature_id uuid not null references public.map_features(id) on delete cascade,
  revision_id uuid not null references public.map_feature_revisions(id),
  primary key (release_id, feature_id)
);

create table public.map_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.map_releases(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status public.map_publish_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text,
  github_run_id bigint,
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index map_publish_jobs_idempotency_idx on public.map_publish_jobs(idempotency_key) where idempotency_key is not null;

create table public.map_channel (
  channel text primary key check (channel = 'production'),
  active_release_id uuid references public.map_releases(id),
  generation integer not null default 0 check (generation >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.map_channel(channel) values ('production') on conflict do nothing;

create table public.map_activation_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'production' check (channel = 'production'),
  from_release_id uuid references public.map_releases(id),
  to_release_id uuid not null references public.map_releases(id),
  action text not null check (action in ('activate', 'rollback')),
  generation integer not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.set_map_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger map_features_updated_at before update on public.map_features for each row execute function public.set_map_updated_at();
create trigger map_channel_updated_at before update on public.map_channel for each row execute function public.set_map_updated_at();

create or replace function public.is_map_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin', false);
$$;

create or replace function public.request_map_publish(p_feature_id uuid, p_revision_id uuid, p_requested_by uuid)
returns jsonb language plpgsql as $$
declare
  channel_row public.map_channel%rowtype;
  revision_row public.map_feature_revisions%rowtype;
  release_row public.map_releases%rowtype;
  job_row public.map_publish_jobs%rowtype;
begin
  if current_user <> 'service_role' and (not public.is_map_admin() or auth.uid() <> p_requested_by) then
    raise exception 'map admin role required';
  end if;
  select * into channel_row from public.map_channel where channel = 'production' for update;
  if exists (select 1 from public.map_publish_jobs where status in ('queued', 'building', 'uploading', 'verifying')) then
    raise exception 'a map publish job is already running';
  end if;
  select * into revision_row from public.map_feature_revisions where id = p_revision_id and feature_id = p_feature_id;
  if revision_row.id is null then raise exception 'revision does not belong to feature'; end if;
  if revision_row.status = 'archived' then raise exception 'archived revision cannot be published'; end if;

  insert into public.map_releases(release_key, generation, parent_release_id, geo_version, created_by)
  values ('g' || (channel_row.generation + 1)::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
          channel_row.generation + 1, channel_row.active_release_id, 'geo-' || replace(gen_random_uuid()::text, '-', ''), p_requested_by)
  returning * into release_row;

  if channel_row.active_release_id is not null then
    insert into public.map_release_features(release_id, feature_id, revision_id)
    select release_row.id, feature_id, revision_id from public.map_release_features where release_id = channel_row.active_release_id;
  end if;
  insert into public.map_release_features(release_id, feature_id, revision_id)
  values (release_row.id, p_feature_id, p_revision_id)
  on conflict (release_id, feature_id) do update set revision_id = excluded.revision_id;

  insert into public.map_publish_jobs(release_id, requested_by) values (release_row.id, p_requested_by) returning * into job_row;
  return jsonb_build_object('releaseId', release_row.id, 'releaseKey', release_row.release_key, 'jobId', job_row.id, 'generation', release_row.generation);
end;
$$;

create or replace function public.save_map_feature_draft(
  p_feature_id uuid, p_name text default null, p_name_vi text default null, p_name_en text default null,
  p_geometry jsonb default null, p_label_point jsonb default null, p_min_zoom smallint default null,
  p_max_zoom smallint default null, p_label_min_zoom smallint default null, p_label_priority integer default null,
  p_updated_by uuid default null
)
returns jsonb language plpgsql as $$
declare feature_row public.map_features%rowtype; revision_id uuid; next_version integer;
declare geometry_value extensions.geometry(MultiPolygon, 4326); label_value extensions.geometry(Point, 4326);
begin
  if not public.is_map_admin() or auth.uid() <> p_updated_by then raise exception 'map admin role required'; end if;
  select * into feature_row from public.map_features where id = p_feature_id for update;
  if feature_row.id is null then raise exception 'feature not found'; end if;
  geometry_value := case when p_geometry is null then feature_row.geometry else extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text), 4326)) end;
  label_value := case when p_label_point is null then feature_row.label_point else extensions.st_setsrid(extensions.st_geomfromgeojson(p_label_point::text), 4326) end;
  if geometry_value is not null and not extensions.st_isvalid(geometry_value) then raise exception 'geometry is invalid'; end if;
  next_version := feature_row.version + 1;
  insert into public.map_feature_revisions(feature_id, geometry, label_point, name, name_vi, name_en, min_zoom, max_zoom, label_min_zoom, label_priority, version, created_by)
  values (p_feature_id, geometry_value, label_value, coalesce(p_name, feature_row.name), coalesce(p_name_vi, feature_row.name_vi), coalesce(p_name_en, feature_row.name_en), coalesce(p_min_zoom, feature_row.min_zoom), coalesce(p_max_zoom, feature_row.max_zoom), coalesce(p_label_min_zoom, feature_row.label_min_zoom), coalesce(p_label_priority, feature_row.label_priority), next_version, 'draft')
  returning id into revision_id;
  update public.map_features set geometry = geometry_value, label_point = label_value, name = coalesce(p_name, name), name_vi = coalesce(p_name_vi, name_vi), name_en = coalesce(p_name_en, name_en), min_zoom = coalesce(p_min_zoom, min_zoom), max_zoom = coalesce(p_max_zoom, max_zoom), label_min_zoom = coalesce(p_label_min_zoom, label_min_zoom), label_priority = coalesce(p_label_priority, label_priority), version = next_version, status = 'draft', updated_by = p_updated_by where id = p_feature_id;
  return jsonb_build_object('revisionId', revision_id, 'featureId', p_feature_id, 'version', next_version);
end;
$$;

create or replace function public.mark_map_release_ready(p_release_id uuid, p_job_id uuid)
returns jsonb language plpgsql as $$
declare release_row public.map_releases%rowtype;
begin
  update public.map_publish_jobs set status = 'verifying', started_at = coalesce(started_at, now()) where id = p_job_id and release_id = p_release_id;
  if not found then raise exception 'publish job does not match release'; end if;
  update public.map_releases set status = 'ready' where id = p_release_id and status = 'building';
  if not found then raise exception 'release is not buildable'; end if;
  select * into release_row from public.map_releases where id = p_release_id;
  return jsonb_build_object('releaseId', release_row.id, 'releaseKey', release_row.release_key, 'generation', release_row.generation);
end;
$$;

create or replace function public.activate_map_release(p_release_id uuid, p_expected_generation integer, p_actor uuid)
returns jsonb language plpgsql as $$
declare channel_row public.map_channel%rowtype; release_row public.map_releases%rowtype; old_release uuid;
begin
  if current_user <> 'service_role' and (not public.is_map_admin() or auth.uid() <> p_actor) then raise exception 'map admin role required'; end if;
  select * into channel_row from public.map_channel where channel = 'production' for update;
  if channel_row.generation <> p_expected_generation then raise exception 'production changed while release was building'; end if;
  select * into release_row from public.map_releases where id = p_release_id and status = 'ready';
  if release_row.id is null then raise exception 'release is not ready'; end if;
  old_release := channel_row.active_release_id;
  update public.map_releases set status = 'superseded' where id = old_release;
  update public.map_releases set status = 'active', activated_at = now() where id = p_release_id;
  update public.map_channel set active_release_id = p_release_id, generation = p_expected_generation + 1, updated_by = p_actor where channel = 'production';
  update public.map_publish_jobs set status = 'succeeded', finished_at = now() where release_id = p_release_id;
  insert into public.map_activation_events(from_release_id, to_release_id, action, generation, actor_id)
  values (old_release, p_release_id, 'activate', p_expected_generation + 1, p_actor);
  return jsonb_build_object('releaseId', p_release_id, 'generation', p_expected_generation + 1);
end;
$$;

create or replace function public.rollback_map_release(p_release_id uuid, p_expected_generation integer, p_actor uuid)
returns jsonb language plpgsql as $$
declare channel_row public.map_channel%rowtype; old_release uuid; target_status public.map_release_status;
begin
  if current_user <> 'service_role' and (not public.is_map_admin() or auth.uid() <> p_actor) then raise exception 'map admin role required'; end if;
  select * into channel_row from public.map_channel where channel = 'production' for update;
  if channel_row.generation <> p_expected_generation then raise exception 'production changed; reload before rollback'; end if;
  select status into target_status from public.map_releases where id = p_release_id;
  if target_status is null or target_status not in ('active', 'superseded') then raise exception 'release is not rollback eligible'; end if;
  old_release := channel_row.active_release_id;
  update public.map_releases set status = 'superseded' where id = old_release and id <> p_release_id;
  update public.map_releases set status = 'active', activated_at = now() where id = p_release_id;
  update public.map_channel set active_release_id = p_release_id, generation = p_expected_generation + 1, updated_by = p_actor where channel = 'production';
  insert into public.map_activation_events(from_release_id, to_release_id, action, generation, actor_id)
  values (old_release, p_release_id, 'rollback', p_expected_generation + 1, p_actor);
  return jsonb_build_object('releaseId', p_release_id, 'generation', p_expected_generation + 1);
end;
$$;

create or replace function public.mark_map_publish_failed(p_job_id uuid, p_error_code text, p_error_message text)
returns void language plpgsql as $$
declare release_id uuid;
begin
  select map_publish_jobs.release_id into release_id from public.map_publish_jobs where id = p_job_id for update;
  if release_id is null then raise exception 'publish job not found'; end if;
  update public.map_publish_jobs set status = 'failed', error_code = left(p_error_code, 120), error_message = left(p_error_message, 2000), finished_at = now() where id = p_job_id;
  update public.map_releases set status = 'failed', failure_reason = left(p_error_message, 2000) where id = release_id and status <> 'active';
end;
$$;

alter table public.map_features enable row level security;
alter table public.map_feature_revisions enable row level security;
alter table public.map_releases enable row level security;
alter table public.map_release_features enable row level security;
alter table public.map_publish_jobs enable row level security;
alter table public.map_channel enable row level security;
alter table public.map_activation_events enable row level security;

create policy "published features are public" on public.map_features for select to anon, authenticated using (status = 'published');
create policy "production channel is public" on public.map_channel for select to anon, authenticated using (channel = 'production');
create policy "active releases are public" on public.map_releases for select to anon, authenticated using (status = 'active');
create policy "admins manage map features" on public.map_features for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins manage revisions" on public.map_feature_revisions for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins read releases" on public.map_releases for select to authenticated using (public.is_map_admin());
create policy "admins read release features" on public.map_release_features for select to authenticated using (public.is_map_admin());
create policy "admins read jobs" on public.map_publish_jobs for select to authenticated using (public.is_map_admin());
create policy "admins read activation events" on public.map_activation_events for select to authenticated using (public.is_map_admin());
create policy "admins manage releases" on public.map_releases for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins manage release features" on public.map_release_features for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins manage jobs" on public.map_publish_jobs for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins manage channel" on public.map_channel for all to authenticated using (public.is_map_admin()) with check (public.is_map_admin());
create policy "admins insert activation events" on public.map_activation_events for insert to authenticated with check (public.is_map_admin());

grant execute on function public.request_map_publish(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_map_feature_draft(uuid, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid) to authenticated;
grant execute on function public.mark_map_release_ready(uuid, uuid) to service_role;
grant execute on function public.activate_map_release(uuid, integer, uuid) to authenticated, service_role;
grant execute on function public.rollback_map_release(uuid, integer, uuid) to authenticated;
grant execute on function public.mark_map_publish_failed(uuid, text, text) to service_role;
