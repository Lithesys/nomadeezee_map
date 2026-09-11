-- Keep editor helpers available to the authenticated admin API only. The
-- public map is served from PMTiles and does not need RPC access.
revoke execute on function public.get_map_feature_editor(uuid) from public, anon;
grant execute on function public.get_map_feature_editor(uuid) to authenticated;

revoke execute on function public.revert_map_feature_revision(uuid, uuid, uuid) from public, anon;
grant execute on function public.revert_map_feature_revision(uuid, uuid, uuid) to authenticated;

-- The worker claims jobs with the service role; do not expose this mutator to
-- browser roles through PostgREST.
revoke execute on function public.start_map_publish_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_map_publish_job(uuid, uuid) to service_role;
