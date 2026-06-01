# Manual RLS Checks

- User A can select their own row from `profiles`.
- User A cannot select User B's row from `profiles`.
- User A can select their own rows from `generations`.
- User A cannot select User B's rows from `generations`.
- User A can select their own rows from `credit_events`.
- User A cannot insert or update `profiles.credits` from the browser client.
- `record_successful_generation` deducts 1 credit and creates one `credit_events` row.
- `record_successful_generation` raises `insufficient_credits` when credits are 0.
