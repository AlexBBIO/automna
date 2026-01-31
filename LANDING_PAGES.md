# Automna Landing Pages

## Overview

| Page | URL | Status | Description |
|------|-----|--------|-------------|
| Original | [automna.ai/](https://automna.ai/) | Live | Initial landing page |
| V2 | [automna.ai/landing2](https://automna.ai/landing2) | Live | Research-informed redesign |
| V3 | [automna.ai/landing3](https://automna.ai/landing3) | Live | Full research implementation |

---

## Landing Page V1 (Original)
**Path:** `/src/app/page.tsx`
**Created:** Jan 28, 2026

Basic landing page with:
- Hero with waitlist signup
- Feature grid
- 3-tier pricing
- Standard dark theme

---

## Landing Page V2
**Path:** `/src/app/landing2/page.tsx`
**Created:** Jan 31, 2026

Research-informed improvements:
- **Hero:** Benefit-focused headline ("Stop managing tasks. Start delegating to AI.")
- **Demo:** Animated conversation showing browser + email + always-on capabilities
- **Animation:** Typing indicators, message fade-in, auto-replay loop
- **Social Proof:** Live waitlist count badge
- **Trust Signal:** "No credit card required" near CTA
- **Comparison:** Side-by-side "Typical AI Chat" vs "Automna Agent"
- **Pricing:** 3-tier with Pro highlighted

---

## Landing Page V3 (Current Best)
**Path:** `/src/app/landing3/page.tsx`
**Created:** Jan 31, 2026

Full implementation of deep research findings:

### Hero
- New headline: "Your AI employee. Always on. Always ready."
- **Dual CTA:** Email signup + "See how it works" scroll link
- **Trust badge:** Shield icon + "Your data stays private"
- **Logo strip:** Placeholder company names ("Trusted by teams at...")

### Demo Section
- Animated conversation with time-skip
- **Human-in-the-loop messaging:** "📧 Email summary ready for review"
- Approval flow shown: "Awaiting your approval to send"
- Footer callout about autonomy control

### Features (Bento Grid)
- Linear-style modular layout
- Large card for "Browse the Web" (spans 2 cols)
- 8 capabilities: Web, Email, Code, Files, APIs, Memory, Multi-channel, 24/7

### Social Proof
- Testimonial with specific metrics
- Quote: "Two days later it had compiled a report with sentiment analysis..."

### Pricing
- **Monthly/Annual toggle** with "Save 17%" badge
- Shows annual billing total
- **FAQ accordion** (4 questions) below pricing

### Final CTA
- Repeat signup form
- **SSO buttons:** GitHub + Google (visual placeholders)
- Queue position shown after signup

---

## Research Sources

Deep research report: `/root/clawd/skills/gemini-deep-research/deep-research-2026-01-31-02-17-38.md`

Key findings applied:
1. Bento grid layouts (Linear/Apple style)
2. Outcome-driven copy over feature lists
3. Dual CTAs for different buyer intents
4. "Human in the loop" messaging for AI trust
5. Social proof near friction points
6. FAQ accordion to address objections
7. Annual pricing toggle with savings callout
8. SSO options for reduced friction

---

## Next Steps / Ideas

- [ ] Make SSO buttons functional (Clerk integration)
- [ ] Add real customer logos when available
- [ ] Implement referral system for waitlist
- [ ] A/B test V2 vs V3 conversion rates
- [ ] Interactive demo sandbox (try before signup)
- [ ] Video demo option
