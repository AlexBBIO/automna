# Agentmail - Email Capabilities

You have access to email through Automna's email API.

**Your email address:** Check the `AGENTMAIL_INBOX_ID` environment variable (e.g., `swiftfox@mail.automna.ai`)

**Rate Limit:** 50 emails per day (resets at midnight UTC)

## Send Email

Use the Automna email API with your gateway token:

```python
import os
import requests

# Your gateway token is in OPENCLAW_GATEWAY_TOKEN
GATEWAY_TOKEN = os.environ["OPENCLAW_GATEWAY_TOKEN"]
API_BASE = "https://automna.ai/api/user/email"

response = requests.post(
    f"{API_BASE}/send",
    headers={
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json"
    },
    json={
        "to": "recipient@example.com",
        "subject": "Hello from your AI agent",
        "text": "This is the email body."
    }
)

result = response.json()
if result.get("success"):
    print(f"Sent! Remaining today: {result['remaining']}")
else:
    print(f"Error: {result.get('error')}")
```

**With HTML and CC:**
```python
response = requests.post(
    f"{API_BASE}/send",
    headers={
        "Authorization": f"Bearer {GATEWAY_TOKEN}",
        "Content-Type": "application/json"
    },
    json={
        "to": [{"email": "recipient@example.com", "name": "John Doe"}],
        "cc": "cc@example.com",
        "subject": "Report attached",
        "text": "Please find the report attached.",
        "html": "<p>Please find the report <b>attached</b>.</p>"
    }
)
```

## Check Your Quota

```python
response = requests.get(
    f"{API_BASE}/send",
    headers={"Authorization": f"Bearer {GATEWAY_TOKEN}"}
)
quota = response.json()
print(f"Sent today: {quota['sent']}/{quota['limit']}")
print(f"Remaining: {quota['remaining']}")
```

## Check Inbox (Receive Emails)

To check for incoming emails, use the Agentmail API directly:

```python
import os
import requests

AGENTMAIL_KEY = os.environ.get("AGENTMAIL_API_KEY")
INBOX_ID = os.environ["AGENTMAIL_INBOX_ID"]

if AGENTMAIL_KEY:
    response = requests.get(
        f"https://api.agentmail.to/v0/inboxes/{INBOX_ID}/messages",
        headers={"Authorization": f"Bearer {AGENTMAIL_KEY}"}
    )
    messages = response.json()
    for msg in messages.get("messages", []):
        print(f"From: {msg['from']}, Subject: {msg['subject']}")
```

**Note:** Reading emails doesn't count against your daily limit. Only sending does.

## Notes

- Your email address is in `AGENTMAIL_INBOX_ID`
- Sending is rate-limited to protect deliverability
- Check your quota before bulk operations
- Replies to your emails arrive in your inbox
