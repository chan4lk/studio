/**
 * Seeds demo data for Area 6 - Quality Life Fitness (https://qualitylife.lk/):
 * a brand kit (+ active voice prompt), a project, three campaigns, and one
 * ready-to-generate brief per campaign.
 *
 *   node --env-file=.env scripts/seed-qualitylife.mjs
 *
 * Idempotent: each entity is looked up by name/topic and skipped if present.
 * Run scripts/seed-admin.mjs first (briefs need a user; the prompt's createdBy
 * prefers a real admin). Requires env: DATABASE_URL.
 *
 * Brand facts sourced from qualitylife.lk (2026-07-05): premium gym in
 * Kadawatha, Sri Lanka. AI-powered coaching, QR check-in, streak tracking +
 * badges, progress tracking, modern cardio/strength/functional equipment,
 * free trial. Plans: Monthly Rs. 7,500 / Quarterly Rs. 21,000 / Annual
 * Rs. 60,000 (discounts up to 50%), corporate rates on request.
 * Hours Mon–Sat 5AM–10PM, Sun 6AM–12PM. 152/B/2 Kandy Rd, Kadawatha 11850.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Palette read off qualitylife.lk (Tailwind orange/amber on gray-900).
const COLORS = [
  "#f97316", // primary / CTA (orange-500)
  "#ea580c", // primary hover (orange-600)
  "#f59e0b", // accent (amber-500)
  "#111827", // dark surface / text (gray-900)
  "#f9fafb", // light background (gray-50)
]

const FONTS = [
  {
    name: "Oswald",
    url: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap",
  },
  {
    name: "Inter",
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
]

const VOICE_PROMPT = `You are writing social media content for Area 6 - Quality Life Fitness, a premium gym in Kadawatha, Sri Lanka (152/B/2 Kandy Rd). Tagline energy: "One Workout at a Time."

Voice attributes:
- Tone: Energetic, encouraging, and down-to-earth. Celebrate consistency and small wins over transformation hype. No body-shaming, no "beach body" framing.
- Person: Address the reader as "you". Active voice, short punchy sentences.
- Audience: Everyday people in and around Kadawatha — beginners welcome. Assume no fitness jargon; explain or avoid terms like "hypertrophy" or "progressive overload".
- Claims: Only use real facts — AI-powered coaching tips, QR smart check-in, streak tracking with badges, progress reports, modern cardio/strength/functional equipment, 14+ years of trainer experience, free trial session. Plans: Monthly Rs. 7,500, Quarterly Rs. 21,000, Annual Rs. 60,000 (discounts up to 50% off regular prices); corporate rates available. Hours: Mon–Sat 5:00 AM–10:00 PM, Sun 6:00 AM–12:00 PM. Do not invent member counts, testimonials, or results.
- Currency: Always "Rs." (Sri Lankan Rupees). Contact: +94 74 343 5786, support@qualitylife.lk.

Platform guidance:
- Instagram: Hook first line, high-energy, 3–5 hashtags (#Area6 #QualityLifeFitness #KadawathaGym plus topical). Under 125 words. End with a clear action: book the free trial or DM/WhatsApp.
- LinkedIn: Community/wellness framing for corporate-rate and habit-building content, up to 200 words, professional but warm.

Banned patterns:
- "No pain no gain", guilt-based motivation, before/after body comparisons.
- Fabricated social proof or made-up statistics.
- "World-class", "revolutionary" — show the feature instead (streaks, AI tips, QR check-in).`

const PROJECT_NAME = "Quality Life Fitness"

// Path A templates. Exact pixel roots match src/lib/aspectRatio.ts
// (SQUARE 1080×1080, PORTRAIT 1080×1350). [PLACEHOLDERS] are filled by the
// design agent; CSS variables carry the qualitylife.lk orange/amber palette.
const SQUARE_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --brand: #f97316; --brand-deep: #ea580c; --accent: #f59e0b; --ink: #f9fafb; --surface: #111827; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; }
  body {
    font-family: Inter, system-ui, sans-serif;
    background:
      radial-gradient(720px 720px at 100% 0%, rgba(249, 115, 22, .28) 0%, transparent 65%),
      radial-gradient(560px 560px at 0% 100%, rgba(245, 158, 11, .18) 0%, transparent 60%),
      var(--surface);
    color: var(--ink);
    display: flex; flex-direction: column;
    padding: 88px 84px;
  }
  .eyebrow {
    align-self: flex-start;
    font-size: 26px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
    color: var(--accent);
    border: 2px solid rgba(245, 158, 11, .45);
    border-radius: 9999px; padding: 14px 32px;
  }
  .headline {
    margin-top: 44px;
    font-family: Oswald, Inter, sans-serif;
    font-size: 104px; font-weight: 700; line-height: 1.02; text-transform: uppercase;
  }
  .headline em { font-style: normal; color: var(--brand); }
  .body { margin-top: 34px; font-size: 36px; line-height: 1.45; color: #d1d5db; max-width: 820px; }
  .spacer { flex: 1; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 40px; }
  .cta {
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%);
    color: #fff; font-size: 34px; font-weight: 700;
    padding: 26px 52px; border-radius: 9999px; white-space: nowrap;
  }
  .footer { text-align: right; font-size: 26px; line-height: 1.5; color: #9ca3af; }
  .footer strong { display: block; font-size: 30px; color: var(--ink); }
</style>
</head>
<body>
  <div class="eyebrow">[EYEBROW]</div>
  <h1 class="headline">[HEADLINE — wrap the key phrase in <em>…</em> for orange]</h1>
  <p class="body">[BODY COPY]</p>
  <div class="spacer"></div>
  <div class="row">
    <div class="cta">[CALL TO ACTION]</div>
    <div class="footer"><strong>Area 6 — Quality Life Fitness</strong>[CONTACT / HOURS LINE]</div>
  </div>
</body>
</html>`

const PORTRAIT_TEMPLATE_HTML = SQUARE_TEMPLATE_HTML
  .replace("width: 1080px; height: 1080px;", "width: 1080px; height: 1350px;")
  .replace("padding: 88px 84px;", "padding: 108px 84px;")

const TEMPLATES = [
  { name: "Area 6 Announcement (Square)", aspectRatio: "SQUARE", htmlTemplate: SQUARE_TEMPLATE_HTML },
  { name: "Area 6 Announcement (Portrait)", aspectRatio: "PORTRAIT", htmlTemplate: PORTRAIT_TEMPLATE_HTML },
]

const CAMPAIGNS = [
  {
    name: "Free Trial Drive",
    defaultTone: "energetic",
    brief: {
      topic: "Free Trial Session - Book Your First Workout",
      description:
        "Promote the free trial session at Area 6 - Quality Life Fitness in Kadawatha. Anyone can experience the full facility before committing: modern cardio, strength and functional training zones, trainers with 14+ years of experience, open Mon–Sat 5AM–10PM and Sun 6AM–12PM. Call to action: book the free trial via WhatsApp +94 74 343 5786 or visit 152/B/2 Kandy Rd, Kadawatha. Emphasize 'your first trial is on us' and that beginners are welcome.",
      goal: "conversion",
      tone: "energetic",
    },
  },
  {
    name: "Membership Plans Promo",
    defaultTone: "confident",
    brief: {
      topic: "Annual Plan Offer - Up to 50% Off",
      description:
        "Promote Area 6's simple, transparent membership pricing: Monthly Rs. 7,500, Quarterly Rs. 21,000, Annual Rs. 60,000 — discounts up to 50% off regular prices. All plans include full access to the facility and smart features (QR check-in, streak tracking, progress reports, AI-powered tips). Flexible online payments — pay monthly, quarterly, or annually. Corporate rates available on request. CTA: join today at qualitylife.lk or WhatsApp +94 74 343 5786.",
      goal: "conversion",
      tone: "confident",
    },
  },
  {
    name: "Smart Fitness Features",
    defaultTone: "motivational",
    brief: {
      topic: "Streak Tracking & AI Coaching - Stay Consistent",
      description:
        "Highlight the smart-technology side of Area 6 - Quality Life Fitness: quick QR code check-in that tracks every gym visit, streak tracking with achievement badges, detailed progress statistics, and personalized AI-powered fitness tips. Angle: consistency beats intensity — build the habit one workout at a time and let the app celebrate every milestone. Audience: people who have struggled to stick with a gym routine. CTA: start your streak with a free trial.",
      goal: "awareness",
      tone: "motivational",
    },
  },
]

async function main() {
  const owner =
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }))
  if (!owner) {
    throw new Error("No user found — run scripts/seed-admin.mjs first (briefs require a userId).")
  }

  // 1. Brand kit (never default — Bistec stays the system default)
  let kit = await prisma.brandKit.findFirst({
    where: { name: PROJECT_NAME, isDeleted: false },
  })
  if (kit) {
    console.log(`Brand kit "${PROJECT_NAME}" already exists (${kit.id}) — skipping`)
  } else {
    kit = await prisma.brandKit.create({
      data: {
        name: PROJECT_NAME,
        isDefault: false,
        colors: COLORS,
        fonts: FONTS,
        logoUrl: null, // upload via /admin/brandkits after first run
        prompts: {
          create: { content: VOICE_PROMPT, version: 1, isActive: true, createdBy: owner.id },
        },
      },
    })
    console.log(`Created brand kit "${PROJECT_NAME}" (${kit.id}) with active voice prompt v1`)
  }

  // 2. Path A templates (one per aspect ratio)
  for (const t of TEMPLATES) {
    const existing = await prisma.brandKitTemplate.findFirst({
      where: { brandKitId: kit.id, name: t.name },
    })
    if (existing) {
      console.log(`Template "${t.name}" already exists (${existing.id}) — skipping`)
      continue
    }
    const template = await prisma.brandKitTemplate.create({ data: { brandKitId: kit.id, ...t } })
    console.log(`Created template "${t.name}" (${template.id}, ${t.aspectRatio})`)
  }

  // 3. Project
  let project = await prisma.project.findFirst({
    where: { name: PROJECT_NAME, isDeleted: false },
  })
  if (project) {
    console.log(`Project "${PROJECT_NAME}" already exists (${project.id}) — skipping`)
  } else {
    project = await prisma.project.create({
      data: { name: PROJECT_NAME, defaultBrandKitId: kit.id, defaultTone: "energetic" },
    })
    console.log(`Created project "${PROJECT_NAME}" (${project.id})`)
  }

  // 4. Campaigns (+ project link) and one brief each
  for (const c of CAMPAIGNS) {
    let campaign = await prisma.campaign.findFirst({
      where: { name: c.name, isDeleted: false },
    })
    if (campaign) {
      console.log(`Campaign "${c.name}" already exists (${campaign.id}) — skipping`)
    } else {
      campaign = await prisma.campaign.create({
        data: {
          name: c.name,
          brandKitId: kit.id,
          defaultTone: c.defaultTone,
          projects: { create: { projectId: project.id } },
        },
      })
      console.log(`Created campaign "${c.name}" (${campaign.id})`)
    }

    const existingBrief = await prisma.brief.findFirst({
      where: { topic: c.brief.topic, campaignId: campaign.id },
    })
    if (existingBrief) {
      console.log(`  Brief "${c.brief.topic}" already exists — skipping`)
      continue
    }
    const brief = await prisma.brief.create({
      data: {
        userId: owner.id,
        campaignId: campaign.id,
        brandKitId: kit.id,
        topic: c.brief.topic,
        description: c.brief.description,
        goal: c.brief.goal,
        tone: c.brief.tone,
        channels: ["INSTAGRAM", "LINKEDIN"],
        aspectRatio: "SQUARE",
        designMode: "GENERATE", // Path B freeform — no QL templates seeded
        copyProviderKey: "cli",
      },
    })
    console.log(`  Created brief "${c.brief.topic}" (${brief.id})`)
  }

  console.log("\nDone. Open http://localhost:3001 → the Quality Life Fitness project,")
  console.log("campaigns, and briefs are ready; generate drafts from any brief.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
