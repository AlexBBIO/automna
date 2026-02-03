# User Features

## Reset Account

**Location:** Dashboard → User Profile (top right) → "Reset Account"

**What it clears:**
- All conversations and chat history
- Agent memory files (workspace/memory/*)
- Session data
- localStorage (conversation state)

**What it preserves:**
- Fly machine (stays running)
- Browserbase context (browser logins preserved)
- Agentmail inbox (same email address)
- Usage history (for billing)
- Custom secrets (API keys user has added)

**How it works:**
1. Calls OpenClaw's `/api/reset-workspace` endpoint on the user's machine
2. OpenClaw clears workspace data and sessions
3. Frontend clears localStorage
4. Page refreshes to fresh state

**Use case:** User wants to start fresh with their agent without losing their integrations or needing to reprovision.
