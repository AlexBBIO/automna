# TOOLS.md - Automna Demo Instance

## Browser (Browserbase)

Cloud browser via Browserbase. The agent can browse the web.

**Usage:** Just use the `browser` tool - it's configured to use Browserbase automatically.

**Example:**
```
browser open https://news.ycombinator.com
browser snapshot
```

## Email (Agentmail)

Send and receive emails from `automnajoi@agentmail.to`.

**Send email:**
```bash
python3 /root/clawd/skills/agentmail/send-email.py \
  --to "recipient@example.com" \
  --subject "Subject" \
  --body "Message body"
```

**Check inbox:**
```bash
python3 /root/clawd/skills/agentmail/check-inbox.py
python3 /root/clawd/skills/agentmail/check-inbox.py --unread
```

## Configuration

- Browserbase: Configured in gateway config (browser.profiles.browserbase)
- Agentmail: Config at `/root/clawd/config/agentmail.json`
