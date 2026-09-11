-- Editor-facing helpers keep PostGIS geometry serialization on the server.
-- The browser receives standard GeoJSON and never needs database credentials.

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
    'created_at', f.created_at,
    'updated_at', f.updated_at
  )
  from public.map_features f
  where f.id = p_feature_id
    and (f.status = 'published' or public.is_map_admin());
$$;

create or replace function public.create_map_feature_draft(
  p_feature_type public.map_feature_type,
  p_name text,
  p_slug text,
  p_name_vi text default null,
  p_name_en text default null,
  p_geometry jsonb default null,
  p_label_point jsonb default null,
  p_min_zoom smallint default 0,
  p_max_zoom smallint default 14,
  p_label_min_zoom smallint default 5,
  p_label_priority integer default 0,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  feature_id uuid;
  revision_id uuid;
  geometry_value extensions.geometry(MultiPolygon, 4326);
  label_value extensions.geometry(Point, 4326);
begin
  if not public.is_map_admin() or auth.uid() <> p_created_by then
    raise exception 'map admin role required';
  end if;

  geometry_value := case
    when p_geometry is null then null
    else extensions.st_multi(
      extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text), 4326)
    )
  end;
  label_value := case
    when p_label_point is null then null
    else extensions.st_setsrid(extensions.st_geomfromgeojson(p_label_point::text), 4326)
  end;

  if geometry_value is not null and not extensions.st_isvalid(geometry_value) then
    raise exception 'geometry is invalid';
  end if;

  insert into public.map_features(
    feature_type, name, name_vi, name_en, slug, geometry, label_point,
    min_zoom, max_zoom, label_min_zoom, label_priority, status, version,
    created_by, updated_by
  ) values (
    p_feature_type, trim(p_name), nullif(trim(p_name_vi), ''), nullif(trim(p_name_en), ''),
    lower(trim(p_slug)), geometry_value, label_value,
    p_min_zoom, p_max_zoom, p_label_min_zoom, p_label_priority, 'draft', 1,
    p_created_by, p_created_by
  ) returning id into feature_id;

  insert into public.map_feature_revisions(
    feature_id, geometry, label_point, name, name_vi, name_en,
    min_zoom, max_zoom, label_min_zoom, label_priority, version, status, created_by
  ) values (
    feature_id, geometry_value, label_value, trim(p_name), nullif(trim(p_name_vi), ''), nullif(trim(p_name_en), ''),
    p_min_zoom, p_max_zoom, p_label_min_zoom, p_label_priority, 1, 'draft', p_created_by
  ) returning id into revision_id;

  return jsonb_build_object('featureId', feature_id, 'revisionId', revision_id, 'version', 1);
end;
$$;

alter function public.get_map_feature_editor(uuid) set search_path = public, extensions, pg_temp;
alter function public.create_map_feature_draft(public.map_feature_type, text, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid) set search_path = public, extensions, pg_temp;

grant execute on function public.get_map_feature_editor(uuid) to anon, authenticated;
grant execute on function public.create_map_feature_draft(public.map_feature_type, text, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid) to authenticated;
