-- Preserve paid/excluded rewards; move unpaid rewards from manual approval to
-- first completed campaign payment. Reconciliation restores eligible rewards.
update records
set data = data || jsonb_build_object(
      'status', 'pending_campaign',
      'eligibility', 'first_campaign_paid',
      'qualifyingSourceId', null,
      'version', version + 1,
      'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    version = version + 1,
    updated_at = now()
where kind = 'referral_credits'
  and data->>'type' = 'signup'
  and data->>'status' in ('pending_review', 'available')
  and coalesce(data->>'eligibility', '') <> 'first_campaign_paid';
