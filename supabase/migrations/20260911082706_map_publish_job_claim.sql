create or replace function public.start_map_publish_job(p_job_id uuid, p_lease_token uuid)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  job_row public.map_publish_jobs%rowtype;
begin
  update public.map_publish_jobs
  set status = 'building',
      attempts = attempts + 1,
      lease_token = p_lease_token,
      lease_expires_at = now() + interval '90 minutes',
      started_at = coalesce(started_at, now()),
      error_code = null,
      error_message = null
  where id = p_job_id
    and status in ('queued', 'failed')
  returning * into job_row;
  if job_row.id is null then
    raise exception 'publish job is not queued or retryable';
  end if;

  update public.map_releases
  set status = 'building', failure_reason = null
  where id = job_row.release_id and status in ('building', 'failed');

  return jsonb_build_object(
    'jobId', job_row.id,
    'releaseId', job_row.release_id,
    'attempts', job_row.attempts,
    'leaseExpiresAt', job_row.lease_expires_at
  );
end;
$$;

alter function public.start_map_publish_job(uuid, uuid)
  set search_path = public, extensions, pg_temp;
grant execute on function public.start_map_publish_job(uuid, uuid) to service_role;
