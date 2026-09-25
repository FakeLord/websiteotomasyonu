-- Faz 2: Realtime — yalnızca DELETE yapılmayan tablolar eklenir (bkz.
-- docs/adr/0003-realtime-dedupe.md: DELETE olayları RLS'e tabi değildir).

alter publication supabase_realtime add table public.businesses;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.stage_transitions;

alter table public.businesses replica identity full;
alter table public.notes replica identity full;
alter table public.stage_transitions replica identity full;
