create or replace function public.roster_size_groups(_min integer default 50, _max integer default 1000)
returns table(program_id uuid, season_year integer, player_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.program_id, r.season_year, count(*) as player_count
  from public.roster_players r
  group by r.program_id, r.season_year
  having count(*) >= _min and count(*) <= _max
  order by count(*) desc
$$;

grant execute on function public.roster_size_groups(integer, integer) to authenticated;
grant execute on function public.roster_size_groups(integer, integer) to service_role;