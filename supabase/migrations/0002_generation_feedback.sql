alter table public.generations
add column if not exists feedback text
check (feedback in ('liked', 'disliked'));
