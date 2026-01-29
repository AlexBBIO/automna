# Agentmail Skill

Send and receive emails via Agentmail API.

## Inbox

- **Address:** automnajoi@agentmail.to
- **API Key:** Stored in `/root/clawd/config/agentmail.json`

## Usage

### Send Email

```bash
python3 /root/clawd/skills/agentmail/send-email.py \
  --to "recipient@example.com" \
  --subject "Subject line" \
  --body "Email body text"
```

**With CC/BCC:**
```bash
python3 /root/clawd/skills/agentmail/send-email.py \
  --to "main@example.com" \
  --cc "copy@example.com" \
  --subject "Subject" \
  --body "Body"
```

### Check Inbox

```bash
python3 /root/clawd/skills/agentmail/check-inbox.py
```

**Filter unread only:**
```bash
python3 /root/clawd/skills/agentmail/check-inbox.py --unread
```

**Get specific message:**
```bash
python3 /root/clawd/skills/agentmail/check-inbox.py --message-id "msg_abc123"
```

## Notes

- Emails are sent from `automnajoi@agentmail.to`
- Replies will arrive in the same inbox
- Check inbox periodically for responses
