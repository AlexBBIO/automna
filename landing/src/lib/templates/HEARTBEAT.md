# Heartbeat Tasks

Check these periodically (every 30 minutes):

## Email Check
1. List recent messages in your inbox using Agentmail
2. Note any new unread messages since last check
3. Update heartbeat-state.json with current state

When the user next messages you, naturally mention new emails:
- "By the way, you have 2 new emails since we last talked"
- "I noticed an email from [sender] about [subject]"

Keep it conversational, not robotic.

## Rules
- If nothing new: reply HEARTBEAT_OK
- Don't message the user during heartbeat
- Just update your awareness for next conversation
