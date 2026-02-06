# Automna Influencer Outreach Plan

> **Status:** DRAFT — Pending Alex's approval
> **Owner:** Joi (automated execution)
> **Email:** joi@mail.automna.ai
> **Master List:** 300+ contacts in MASTER-LIST.md

---

## Overview

Automated, personalized outreach to AI influencers across YouTube, Twitter/X, TikTok, newsletters, podcasts, and LinkedIn. Goal: get Automna featured, reviewed, or mentioned by as many relevant creators as possible.

---

## Phase 1: Contact Info Gathering (Day 1-2)

### What
Build a structured contact database with verified emails and platform handles for every person on the master list.

### How
For each influencer, I will:
1. **YouTube channels** — Visit About page via Browserbase, extract business email
2. **Twitter accounts** — Check bio for email, website link, or Linktree. Visit linked website for contact page
3. **Newsletter writers** — Find their website/Substack, look for contact or "advertise with us" page
4. **Podcast hosts** — Check podcast website for guest booking forms or contact emails
5. **LinkedIn** — Note profile URL (can't DM without connection, so email is primary)
6. **TikTok/Instagram** — Check bio for email or Linktree

### Output
A JSON database at `outreach/contacts.json`:
```json
{
  "matt_wolfe": {
    "name": "Matt Wolfe",
    "platforms": ["youtube", "twitter", "newsletter"],
    "email": "matt@futuretools.io",
    "twitter": "@mreflow",
    "youtube": "@mreflow",
    "website": "futuretools.io",
    "followers": "895K YT",
    "tier": 1,
    "recent_content": "",
    "personalization_angle": "",
    "status": "not_contacted",
    "last_contact": null,
    "response": null
  }
}
```

### Estimated time
- Sub-agents running Browserbase scraping in parallel
- ~4-6 hours for 300+ contacts
- Many will not have public emails (expected ~40-50% hit rate)

---

## Phase 2: Research & Personalization (Day 2-3)

### What
For each contact with a valid email, research their recent content and write a personalization angle.

### How
For each person:
1. Web search their name + "latest video" or "latest tweet" or "latest newsletter"
2. Identify 1-2 specific recent pieces of content relevant to AI agents/automation
3. Write a 1-2 sentence personalization hook that references their content
4. Note what angle would resonate (e.g., "your no-code audience would love this" vs "your AI research audience would find this interesting")

### Example
```
Matt Wolfe:
- Recent: Reviewed 10 AI agents in latest YouTube video
- Hook: "Loved your recent roundup of AI agents — Automna takes a different approach by giving each user their own dedicated server with a persistent agent, not just a chatbot wrapper."
- Angle: Tool review / demo offer
```

### Output
Populated `recent_content` and `personalization_angle` fields in contacts.json

---

## Phase 3: Email Outreach — Waves (Day 3+)

### Strategy
Send in waves of 20-30 emails per day to avoid spam filters. Start with Tier 1, then Tier 2, then Tier 3.

### Wave Schedule
| Wave | Day | Target | Count |
|------|-----|--------|-------|
| 1 | Day 3 | Tier 1 — AI tool reviewers (Matt Wolfe, TheAIGRID, etc.) | ~15-20 |
| 2 | Day 4 | Tier 1 — Newsletters (Rundown AI, Superhuman, Ben's Bites) | ~15-20 |
| 3 | Day 5 | Tier 2 — Mid-tier YouTubers (AI Jason, AI Andy, etc.) | ~20-25 |
| 4 | Day 6 | Tier 2 — Mid-tier Twitter/TikTok | ~20-25 |
| 5 | Day 7 | Tier 2 — Podcasts | ~15-20 |
| 6 | Day 8-10 | Tier 3 — Remaining contacts | ~20-25/day |

### Email Templates (personalized per recipient)

**Template A: For YouTubers/TikTokers**
```
Subject: [Name] — would you want to try a personal AI agent?

Hi [Name],

[Personalization hook referencing their recent content]

I'm reaching out from Automna (automna.ai). We're building something different from the usual ChatGPT wrappers — each user gets their own AI agent running on a dedicated server, 24/7. It can browse the web, manage email, connect to apps, and handle tasks autonomously while you sleep.

I think your audience would find this genuinely interesting. Would you be open to early access to try it out? No strings attached — if you like it, maybe a review or mention. If not, keep the access.

Either way, big fan of your work on [specific content reference].

— Joi
Automna (automna.ai)
AI Agent, Outreach & Partnerships
```

**Template B: For Newsletter Writers**
```
Subject: For [Newsletter Name] readers — personal AI agents

Hi [Name],

[Personalization hook]

Quick pitch: Automna gives each user their own persistent AI agent on a dedicated server. Not a chatbot — an actual agent that browses the web, handles email, connects to tools, and works autonomously.

We'd love to offer your readers exclusive early access or a feature deal. Happy to provide a demo, assets, or whatever would make a good story for [Newsletter Name].

— Joi
Automna (automna.ai)
```

**Template C: For Podcast Hosts**
```
Subject: Guest pitch — the future of personal AI agents

Hi [Name],

[Personalization hook]

I'm reaching out on behalf of Automna (automna.ai). We're giving everyone their own personal AI agent — a dedicated instance that runs 24/7, browses the web, manages email, and handles tasks autonomously.

Would love to chat about the future of personal AI agents on [Podcast Name]. Our founder Alex Corrino can speak to the vision, the tech, and where AI agents are headed.

Happy to share early access for you and your audience too.

— Joi
Automna (automna.ai)
```

**Template D: For Twitter/LinkedIn Influencers (no email — DM approach)**
```
Hey [Name] — love your posts about [topic]. We're building Automna (automna.ai), a platform where everyone gets their own AI agent on a dedicated server. Not a wrapper — a real persistent agent.

Would love to give you early access if you're interested. No pitch, just think you'd find it genuinely cool.
```

### Email Rules
- **Max 30 sends per day** (Agentmail rate limit is 50, keep buffer)
- **Never send between 10pm-8am** recipient's local time
- **Subject lines** — personalized, no clickbait, no ALL CAPS
- **No attachments** on first email (triggers spam filters)
- **Plain text preferred** over HTML (better deliverability for cold email)
- **Every email must have a unique personalization hook** — no mass blast

---

## Phase 4: Follow-Up (Day 10-17)

### Strategy
One follow-up to non-responders, 7 days after initial email.

### Follow-Up Template
```
Subject: Re: [Original subject]

Hey [Name] — just bumping this in case it got buried. Happy to jump on a quick call or send over a demo video if that's easier.

No worries if the timing isn't right — we'll be here.

— Joi
```

### Rules
- **Only 1 follow-up** per person. No more.
- **If no response after follow-up** — mark as "no response" and move on
- **If they respond** — flag immediately in Discord #influencer-contact for Alex to review
- **Never follow up to a "no"** — respect it

---

## Phase 5: Twitter Engagement (Ongoing, Parallel)

### Strategy
For Tier 1 targets on Twitter, build familiarity through organic engagement before any pitch.

### How
Using the Twitter reply bot:
1. Follow their account
2. Reply thoughtfully to 2-3 of their tweets over a 1-2 week period
3. Quote tweet something interesting they posted (with genuine commentary)
4. After 1-2 weeks of engagement, DM with Template D

### Targets (Twitter engagement priority)
- @mreflow (Matt Wolfe)
- @rowancheung (Rowan Cheung)
- @LinusEkenstam (Linus Ekenstam)
- @skirano (Pietro Schirano)
- @AIJasonZ (AI Jason)
- @TheAiGrid
- @bentossell (Ben Tossell)
- @AlphaSignalAI

### Rules
- **Max 3-5 engagements per day** (don't look like a bot)
- **Only genuine, thoughtful replies** — no "Great post! 🔥" spam
- **Never pitch in a public reply** — only DMs after rapport
- **All reply drafts posted to Discord #influencer-contact for Alex to approve before sending**

---

## Phase 6: Tracking & Reporting

### Contact Database
`outreach/contacts.json` tracks every interaction:
- `status`: not_contacted → emailed → followed_up → responded → converted / no_response / declined
- `last_contact`: timestamp
- `response`: their reply text
- `notes`: any context

### Weekly Report
Every Monday, post to Discord #influencer-contact:
- Emails sent this week
- Response rate
- Notable responses (positive or negative)
- Follow-ups sent
- Twitter engagements made
- Any conversions (someone agreed to review/feature)

### Response Handling
- **Positive responses** → immediately flag in Discord for Alex
- **Questions about the product** → I can answer basics, but loop Alex in for anything detailed
- **Partnership/sponsorship asks** → flag for Alex (budget decisions)
- **Negative responses** → mark as declined, respect it, move on

---

## Prerequisites (Before Starting)

1. ✅ Email inbox: joi@mail.automna.ai (done)
2. ✅ Alex approved plan (2026-02-06)
3. ⬜ Automna demo video or landing page ready (for "check it out" link)
4. ✅ One-liner pitch: "Automna is an OpenClaw-based agent that's made for the masses. One-click set up, and you're good to go."
5. ✅ Response routing: Check email hourly, ping Alex in Discord if we get a reply
6. ✅ Offer: Free subscription + free tokens. No budget/sponsorship talk.
7. ✅ Twitter account: Alex's main account

---

## Decisions (From Alex, 2026-02-06)

- **Pitch:** "Automna is an OpenClaw-based agent that's made for the masses. One-click set up, and you're good to go."
- **Offer:** Free subscription + free tokens for influencers who give it a plug
- **No budget talk** — just share the app, be nice, offer free access
- **Email monitoring:** Check joi@mail.automna.ai hourly, ping Alex on any reply
- **Twitter engagement:** From Alex's main account

---

## Timeline

| Phase | Timeline | Key Action |
|-------|----------|------------|
| 1. Contact gathering | Day 1-2 | Scrape emails via Browserbase |
| 2. Research & personalization | Day 2-3 | Research recent content, write hooks |
| 3. Email waves (Tier 1) | Day 3-5 | 15-20 emails/day to top targets |
| 3. Email waves (Tier 2-3) | Day 6-10 | 20-25 emails/day |
| 4. Follow-ups | Day 10-17 | 1 follow-up to non-responders |
| 5. Twitter engagement | Ongoing | Parallel to email, 3-5 interactions/day |
| 6. Reporting | Weekly | Monday summary to Discord |

**Expected outcomes (conservative):**
- ~150 emails sent (50% of 300 have findable emails)
- ~15-25% open rate (cold email average)
- ~3-5% response rate
- ~5-10 positive conversations
- ~2-3 actual reviews/features

---

*This plan is designed to be executed entirely by Joi with Alex's oversight on responses and strategy decisions.*
