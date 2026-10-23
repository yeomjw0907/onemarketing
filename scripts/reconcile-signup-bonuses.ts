import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { list, transaction, closeDb, schemaName } =
  await import("../src/lib/db");
const { applyMigrations } = await import("../src/lib/migrate");
const { syncSignupBonus } = await import("../src/lib/referrals");
try {
  const applied = await applyMigrations();
  const credits = (await list("referral_credits")).filter(
    (c) =>
      c.type === "signup" &&
      ["pending_campaign", "available"].includes(String(c.status)),
  );
  for (const credit of credits)
    await transaction(() =>
      syncSignupBonus(
        String(credit.referredParticipantId),
        "system:signup-bonus-policy",
      ),
    );
  console.log(
    JSON.stringify({
      schema: schemaName(),
      migrations: applied,
      reconciled: credits.length,
    }),
  );
} finally {
  await closeDb();
}
