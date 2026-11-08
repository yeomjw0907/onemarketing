import { query, transaction, execute } from "./db";
import {
  summarizeFunnel,
  type FunnelDefinition,
  type FunnelRange,
} from "./funnel-metrics";
type Row = { id: string; started: string; next: string | null; status: string };
const iso = (value: unknown): string | null =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string" && value
      ? value
      : null;
// Project only IDs, business timestamps and states. No names, contact, URLs,
// identity tokens, bank details or free-text content enter the analytics report.
export async function platformFunnel(range: FunnelRange) {
  return transaction(async () => {
    await execute("set transaction isolation level repeatable read read only");
    const bounds = [
      new Date(range.start).toISOString(),
      new Date(range.end).toISOString(),
    ];
    const advertisers = await query<Row>(
      `
      select a.id::text, a.created_at::text as started,
        (select min(o.created_at)::text from commerce_orders o where o.advertiser_id=a.id and o.created_at>=a.created_at) as next,
        'registered' as status
      from advertiser_accounts a where a.created_at >= $1::timestamptz and a.created_at < $2::timestamptz`,
      bounds,
    );
    const participants = await query<Row & { registered: string | null }>(
      `
      with signups as (
        select distinct on (coalesce(participant_id,id::text)) id, participant_id, status, created_at
        from participant_applications order by coalesce(participant_id,id::text),created_at,id
      )
      select s.id::text,s.created_at::text as started,s.status,
        r.created_at::text as registered,
        (select min(t.at)::text from (
          select a.created_at as at from commerce_applications a where a.participant_id=s.participant_id
          union all select m.created_at from market_entries m where m.kind='application' and m.owner_id=s.participant_id
        ) t where t.at>=s.created_at) as next
      from signups s left join records r on r.id=s.participant_id and r.kind='participants'
      where s.created_at >= $1::timestamptz and s.created_at < $2::timestamptz`,
      bounds,
    );
    const applications = await query<
      Row & {
        accepted: string | null;
        submitted: string | null;
        verified: string | null;
        paid: string | null;
      }
    >(
      `
      select id::text,created_at::text as started,data->>'status' as status,
        coalesce(data->>'acceptedAt',case when data->>'status' in ('accepted','submitted','revision','verified','paid') then data->>'respondedAt' end) as accepted,
        coalesce(data->>'firstSubmittedAt',data->>'submittedAt') as submitted,
        data->>'verifiedAt' as verified,data->>'paidAt' as paid
      from commerce_applications where created_at >= $1::timestamptz and created_at < $2::timestamptz`,
      bounds,
    );
    const orders = await query<
      Row & { paid: string | null; completed: string | null }
    >(
      `
      select o.id::text,o.created_at::text as started,o.data->>'status' as status,o.data->>'paidAt' as paid,
        case when count(c.id)>0 and bool_and(c.data->>'status'='completed')
          and bool_and(c.data->>'completedAt' is not null) then max(c.data->>'completedAt') end as completed
      from commerce_orders o left join commerce_campaigns c on c.order_id=o.id
      where o.created_at >= $1::timestamptz and o.created_at < $2::timestamptz
      group by o.id`,
      bounds,
    );
    const legacy = await query<
      Row & {
        accepted: string | null;
        submitted: string | null;
        verified: string | null;
        paid: string | null;
      }
    >(
      `
      select m.id::text,m.created_at::text as started,
        case when s.data->>'payoutStatus'='paid' then 'paid' else coalesce(o.data->>'status',m.data->>'status','applied') end as status,
        s.data->>'acceptedAt' as accepted,t.submitted,t.verified,
        case when s.data->>'payoutStatus'='paid' then s.data->>'paidAt' end as paid
      from market_entries m
      left join records o on o.id=m.data->>'offerId' and o.kind='work_offers'
      left join records s on s.id=o.data->>'slotId' and s.kind='work_slots' and s.data->>'participantId'=m.owner_id
      left join lateral (
        select case when count(*)>0 and bool_and(coalesce(r.data->>'firstSubmittedAt',r.data->>'submittedAt') is not null)
          then max(coalesce(r.data->>'firstSubmittedAt',r.data->>'submittedAt')) end as submitted,
          case when count(*)>0 and bool_and(coalesce(r.data->>'firstVerifiedAt',r.data->>'verifiedAt') is not null)
          then max(coalesce(r.data->>'firstVerifiedAt',r.data->>'verifiedAt')) end as verified
        from records r where r.kind='tasks' and r.data->>'workSlotId'=s.id
          and r.data->>'participantId'=m.owner_id and r.data->>'deletedAt' is null
      ) t on true
      where m.kind='application' and m.created_at >= $1::timestamptz and m.created_at < $2::timestamptz`,
      bounds,
    );
    const [coverage] = await query<{
      legacyRequests: number;
      legacyApplications: number;
      undatedCompleted: number;
    }>(
      `
      select (select count(*)::int from market_entries where kind='request' and created_at >= $1::timestamptz and created_at < $2::timestamptz) as "legacyRequests",
        (select count(*)::int from market_entries where kind='application' and created_at >= $1::timestamptz and created_at < $2::timestamptz) as "legacyApplications",
        (select count(*)::int from commerce_campaigns where data->>'status'='completed' and data->>'completedAt' is null and created_at >= $1::timestamptz and created_at < $2::timestamptz) as "undatedCompleted"`,
      bounds,
    );
    const definitions: FunnelDefinition[] = [
      {
        key: "participant_activation",
        title: "참여자 가입 → 첫 지원",
        unit: "가입자",
        description:
          "공개 가입 신청 기준. 첫 지원에는 기존 모집과 새 캠페인 지원을 모두 포함합니다. 관리자 직접 등록자는 제외합니다.",
        steps: ["가입 신청 접수", "참여자 등록", "첫 캠페인 지원"],
        journeys: participants.map((r) => ({
          id: r.id,
          status: r.status,
          times: [iso(r.started), iso(r.registered), iso(r.next)],
        })),
      },
      {
        key: "advertiser_activation",
        title: "광고주 가입 → 첫 주문",
        unit: "계정",
        description:
          "생성된 광고주 계정 기준. 새 주문·결제 시스템의 첫 주문을 집계합니다. 기존 견적 상담은 주문으로 세지 않습니다.",
        steps: ["광고주 계정 생성", "첫 주문 접수"],
        journeys: advertisers.map((r) => ({
          id: r.id,
          status: r.status,
          times: [iso(r.started), iso(r.next)],
        })),
      },
      {
        key: "application_completion",
        title: "캠페인 지원 → 완료·정산",
        unit: "지원건",
        description:
          "새 캠페인 지원건 기준. 같은 지원건의 실제 수락·게시 제출·검수 승인·지급 기록을 연결합니다. 재시도·재지원은 중복 집계하지 않습니다.",
        steps: [
          "지원 접수",
          "참여 수락",
          "게시 링크 제출",
          "검수 승인",
          "리워드 지급",
        ],
        journeys: applications.map((r) => ({
          id: r.id,
          status: r.status,
          times: [
            iso(r.started),
            iso(r.accepted),
            iso(r.submitted),
            iso(r.verified),
            iso(r.paid),
          ],
        })),
      },
      {
        key: "order_completion",
        title: "주문 → 입금·운영 완료",
        unit: "주문건",
        description:
          "새 주문 기준. 주문에 포함된 모든 캠페인의 운영 완료가 기록되어야 마지막 단계에 도달합니다. 운영 완료와 리워드 지급은 별개입니다.",
        steps: ["주문 접수", "입금 확인", "전체 캠페인 운영 완료"],
        journeys: orders.map((r) => ({
          id: r.id,
          status: r.status,
          times: [iso(r.started), iso(r.paid), iso(r.completed)],
        })),
      },
    ];
    definitions.push({
      key: "legacy_application_completion",
      title: "기존 모집 지원 → 완료·정산",
      unit: "지원건",
      description:
        "기존 모집 지원에 연결된 제안·배정 기준. 배정된 모든 게시 작업의 제출·검수 기록과 해당 배정의 전체 지급을 연결합니다. 연결 정보나 시각이 없는 단계는 추정하지 않습니다.",
      steps: [
        "지원 접수",
        "참여 수락",
        "전체 게시 제출",
        "전체 검수 승인",
        "리워드 지급",
      ],
      journeys: legacy.map((r) => ({
        id: r.id,
        status: r.status,
        times: [
          iso(r.started),
          iso(r.accepted),
          iso(r.submitted),
          iso(r.verified),
          iso(r.paid),
        ],
      })),
    });
    return {
      range,
      coverage,
      funnels: definitions.map((d) => summarizeFunnel(d, range)),
    };
  });
}
export type PlatformFunnelReport = Awaited<ReturnType<typeof platformFunnel>>;
