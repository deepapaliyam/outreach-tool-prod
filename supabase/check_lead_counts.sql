-- Optional: see your REAL lead numbers straight from the database (Supabase → SQL Editor → paste → Run).
-- Nothing here changes any data. Run each block on its own to see its result.

-- 1) How many leads are saved, and are any repeated?
select count(*)                          as leads_saved,
       count(distinct entity_id)         as distinct_entity_ids,   -- equal to leads_saved = no repeats
       count(distinct lower(trim(name))) as distinct_names
from public.leads;

-- 2) How many were added on each day (India time), newest first.
select (created_at at time zone 'Asia/Kolkata')::date as day_added, count(*) as leads
from public.leads
group by 1
order by 1 desc
limit 20;

-- 3) Any business name that appears more than once (same name, different entity_id)?
select lower(trim(name)) as business, count(*) as copies
from public.leads
group by 1
having count(*) > 1
order by 2 desc
limit 25;
