import { query, get } from "./db";
import { publicCampaigns, marketEntry } from "./market";
import { type CommerceActor } from "./commerce";
import { type CampaignSummary } from "./campaign-display";
type Row = Record<string, any>;
export async function campaignCatalog() {
  const rows = await query<Row>(
    "select c.id,c.data,c.created_at,count(a.id) filter(where a.data->>'status'<>'withdrawn')::int as applications from commerce_campaigns c join commerce_orders o on o.id=c.order_id left join commerce_applications a on a.campaign_id=c.id where o.data->>'status'='paid' and coalesce(c.data->'input'->>'visibility','public')='public' and c.data->>'status' in ('recruiting','selecting','producing','review','completed') group by c.id order by c.created_at desc",
  );
  const now = Date.now();
  const campaigns: CampaignSummary[] = rows.map((c) => {
    const d = c.data.input;
    const recruiting =
      c.data.status === "recruiting" &&
      Date.parse(d.deadline + "T23:59:59+09:00") > now;
    return {
      id: c.id,
      source: "commerce",
      title: d.title,
      brand: d.brand,
      category: d.category || "other",
      fulfillment: d.fulfillment || "provided",
      region: d.region || "",
      imageUrl: d.imageUrl || "",
      channel: d.channel,
      types: [d.channel],
      quantity: d.quantity,
      applicationCount: c.applications,
      reward:
        d.kind === "package" ? (c.data.participantReward ?? 7000) : d.reward,
      benefit: d.benefit,
      deadline: d.deadline,
      submissionDeadline: d.submissionDeadline,
      status:
        c.data.status === "recruiting" && !recruiting
          ? "selecting"
          : c.data.status,
      createdAt: c.created_at,
      canApply: recruiting,
    };
  });
  const legacy = await publicCampaigns();
  const applications = legacy.length
    ? await query<Row>(
        "select data->>'campaignId' id,count(*)::int count from market_entries where kind='application' and data->>'status'<>'withdrawn' group by data->>'campaignId'",
      )
    : [];
  for (const c of legacy) {
    if (!c) continue;
    campaigns.push({
      id: c.id,
      source: "legacy",
      title: c.title,
      brand: c.brand || "원마케팅",
      category: c.category || "other",
      fulfillment: c.fulfillment || "provided",
      region: c.region || "",
      imageUrl: c.imageUrl || "",
      channel: c.types.includes("bundle") ? "bundle" : c.types[0],
      types: c.types,
      quantity: c.quantity,
      applicationCount: applications.find((a) => a.id === c.id)?.count || 0,
      reward: c.types.includes("bundle")
        ? c.rewards.bundle
        : c.types.includes("blog")
          ? c.rewards.blog
          : c.rewards.clip,
      benefit: c.benefit || "",
      deadline: c.deadline,
      submissionDeadline: String(c.due),
      status: c.remaining ? "recruiting" : "selecting",
      createdAt: c.createdAt,
      canApply: c.remaining > 0,
    });
  }
  return {
    campaigns,
    counts: {
      recruiting: campaigns.filter((c) => c.status === "recruiting").length,
      selecting: campaigns.filter((c) => c.status === "selecting").length,
      active: campaigns.filter((c) =>
        ["producing", "review"].includes(c.status),
      ).length,
    },
  };
}
export async function campaignDetails(
  id: string,
  viewer: CommerceActor | null,
) {
  const catalog = await campaignCatalog();
  const summary = catalog.campaigns.find((c) => c.id === id);
  if (!summary) return null;
  if (!viewer)
    return {
      summary,
      locked: true,
      viewerRole: null,
      details: null,
      application: null,
    };
  if (summary.source === "commerce") {
    const [c] = await query<Row>(
      "select c.*,o.advertiser_id from commerce_campaigns c join commerce_orders o on o.id=c.order_id where c.id=$1",
      [id],
    );
    const applications =
      viewer.role === "participant"
        ? await query<Row>(
            "select id,data,version from commerce_applications where campaign_id=$1 and participant_id=$2",
            [id, viewer.id],
          )
        : [];
    const a = applications[0];
    return {
      summary,
      locked: false,
      viewerRole: viewer.role,
      isOwner: viewer.role === "admin" || c.advertiser_id === viewer.id,
      details: {
        product: c.data.input.product,
        guide: c.data.input.guide,
        terms: c.data.terms,
      },
      application: a
        ? { id: a.id, status: a.data.status, version: a.version }
        : null,
    };
  }
  const c = await marketEntry(id, "campaign");
  const p = await get(String(c.data.projectId));
  const application =
    viewer.role === "participant"
      ? (
          await query<Row>(
            "select id,data,version from market_entries where kind='application' and owner_id=$1 and data->>'campaignId'=$2",
            [viewer.id, id],
          )
        )[0]
      : null;
  return {
    summary,
    locked: false,
    viewerRole: viewer.role,
    isOwner: viewer.role === "admin",
    details: {
      product: summary.title,
      guide: c.data.guide || p?.guide || p?.instructions || "",
      terms: null,
    },
    application: application
      ? {
          id: application.id,
          status: application.data.status,
          version: application.version,
        }
      : null,
  };
}
