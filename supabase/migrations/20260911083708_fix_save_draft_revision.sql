create or replace function public.save_map_feature_draft(
  p_feature_id uuid, p_name text default null, p_name_vi text default null, p_name_en text default null,
  p_geometry jsonb default null, p_label_point jsonb default null, p_min_zoom smallint default null,
  p_max_zoom smallint default null, p_label_min_zoom smallint default null, p_label_priority integer default null,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  feature_row public.map_features%rowtype;
  revision_id uuid;
  next_version integer;
  geometry_value extensions.geometry(MultiPolygon, 4326);
  label_value extensions.geometry(Point, 4326);
  name_value text;
  name_vi_value text;
  name_en_value text;
  min_zoom_value smallint;
  max_zoom_value smallint;
  label_min_zoom_value smallint;
  label_priority_value integer;
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

  geometry_value := case
    when p_geometry is null then feature_row.geometry
    else extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometry::text), 4326))
  end;
  label_value := case
    when p_label_point is null then feature_row.label_point
    else extensions.st_setsrid(extensions.st_geomfromgeojson(p_label_point::text), 4326)
  end;
  if geometry_value is not null and not extensions.st_isvalid(geometry_value) then
    raise exception 'geometry is invalid';
  end if;

  name_value := coalesce(nullif(trim(p_name), ''), feature_row.name);
  name_vi_value := case when p_name_vi is null then feature_row.name_vi else nullif(trim(p_name_vi), '') end;
  name_en_value := case when p_name_en is null then feature_row.name_en else nullif(trim(p_name_en), '') end;
  min_zoom_value := coalesce(p_min_zoom, feature_row.min_zoom);
  max_zoom_value := coalesce(p_max_zoom, feature_row.max_zoom);
  label_min_zoom_value := coalesce(p_label_min_zoom, feature_row.label_min_zoom);
  label_priority_value := coalesce(p_label_priority, feature_row.label_priority);
  if max_zoom_value < min_zoom_value then
    raise exception 'max_zoom must be greater than or equal to min_zoom';
  end if;

  next_version := feature_row.version + 1;
  insert into public.map_feature_revisions(
    feature_id, geometry, label_point, name, name_vi, name_en,
    min_zoom, max_zoom, label_min_zoom, label_priority,
    version, status, created_by
  ) values (
    p_feature_id, geometry_value, label_value, name_value, name_vi_value, name_en_value,
    min_zoom_value, max_zoom_value, label_min_zoom_value, label_priority_value,
    next_version, 'draft', p_updated_by
  ) returning id into revision_id;

  update public.map_features
  set geometry = geometry_value,
      label_point = label_value,
      name = name_value,
      name_vi = name_vi_value,
      name_en = name_en_value,
      min_zoom = min_zoom_value,
      max_zoom = max_zoom_value,
      label_min_zoom = label_min_zoom_value,
      label_priority = label_priority_value,
      version = next_version,
      status = 'draft',
      updated_by = p_updated_by
  where id = p_feature_id;

  return jsonb_build_object('revisionId', revision_id, 'featureId', p_feature_id, 'version', next_version);
end;
$$;

alter function public.save_map_feature_draft(uuid, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid)
  set search_path = public, extensions, pg_temp;
grant execute on function public.save_map_feature_draft(uuid, text, text, text, jsonb, jsonb, smallint, smallint, smallint, integer, uuid) to authenticated;
