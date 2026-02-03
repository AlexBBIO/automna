# Heartbeat Tasks

Check these periodically (every 30 minutes):

## Email Check
1. Check your inbox for new messages using Agentmail
2. Note any new unread messages since last check
3. Update heartbeat-state.json with timestamp and count

When the user next messages you, naturally mention new emails:
- "By the way, you have 2 new emails since we last talked"
- "I noticed an email from [sender] about [subject]"

Keep it conversational, not robotic.

## Rules
- If nothing new: reply HEARTBEAT_OK
- Don't message the user during heartbeat - just build awareness
- Update heartbeat-state.json to track what you've seen
- Mention new mail naturally when the user chats next
