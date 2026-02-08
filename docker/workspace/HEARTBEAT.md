# Heartbeat Tasks

Check these periodically (every 30 minutes):

## Email Check
1. Check your inbox for new messages using Agentmail
2. Note any new unread messages since last check
3. Update heartbeat-state.json with timestamp and count

## Notifications Channel

When you find something worth reporting (new emails, completed tasks, alerts):

1. Send a summary to the **Notifications** conversation:
   ```
   sessions_send(label: "notifications", message: "📧 2 new emails: ...")
   ```
2. Keep notifications concise and scannable
3. Group multiple items into one message when possible

**Examples:**
- "📧 New email from GitHub: PR review requested on repo-name"
- "📧 3 new emails since last check (2 from newsletters, 1 from dana@example.com about dinner plans)"
- "✅ Reminder: You asked me to remind you about the 3pm meeting"

## Rules
- If nothing new: reply HEARTBEAT_OK
- Use the Notifications conversation for all periodic findings
- Update heartbeat-state.json to track what you've seen
- Keep it scannable — no walls of text
