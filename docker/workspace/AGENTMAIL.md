# Agentmail - Email Capabilities

You have access to Agentmail for sending and receiving emails.

**Environment variables available:**
- `AGENTMAIL_API_KEY` - Your API key
- `AGENTMAIL_INBOX_ID` - Your inbox address (e.g., automna-abc123@agentmail.to)

## Send Email

```python
import os
import requests

response = requests.post(
    f"https://api.agentmail.to/v0/inboxes/{os.environ['AGENTMAIL_INBOX_ID']}/messages",
    headers={
        "Authorization": f"Bearer {os.environ['AGENTMAIL_API_KEY']}",
        "Content-Type": "application/json"
    },
    json={
        "to": [{"email": "recipient@example.com"}],
        "subject": "Hello from your AI agent",
        "text": "This is the email body."
    }
)
print(response.json())
```

**With HTML and attachments:**
```python
response = requests.post(
    f"https://api.agentmail.to/v0/inboxes/{os.environ['AGENTMAIL_INBOX_ID']}/messages",
    headers={
        "Authorization": f"Bearer {os.environ['AGENTMAIL_API_KEY']}",
        "Content-Type": "application/json"
    },
    json={
        "to": [{"email": "recipient@example.com", "name": "John Doe"}],
        "cc": [{"email": "cc@example.com"}],
        "subject": "Report attached",
        "text": "Please find the report attached.",
        "html": "<p>Please find the report <b>attached</b>.</p>"
    }
)
```

## Check Inbox

```python
import os
import requests

# List messages
response = requests.get(
    f"https://api.agentmail.to/v0/inboxes/{os.environ['AGENTMAIL_INBOX_ID']}/messages",
    headers={"Authorization": f"Bearer {os.environ['AGENTMAIL_API_KEY']}"}
)
messages = response.json()

for msg in messages.get("messages", []):
    print(f"From: {msg['from']}")
    print(f"Subject: {msg['subject']}")
    print(f"Date: {msg['created_at']}")
    print("---")
```

**Get specific message:**
```python
message_id = "msg_abc123"
response = requests.get(
    f"https://api.agentmail.to/v0/inboxes/{os.environ['AGENTMAIL_INBOX_ID']}/messages/{message_id}",
    headers={"Authorization": f"Bearer {os.environ['AGENTMAIL_API_KEY']}"}
)
message = response.json()
print(message["text"])  # Plain text body
print(message["html"])  # HTML body (if available)
```

## Reply to Email

```python
import os
import requests

# Reply in thread
original_message_id = "msg_abc123"
response = requests.post(
    f"https://api.agentmail.to/v0/inboxes/{os.environ['AGENTMAIL_INBOX_ID']}/messages/{original_message_id}/reply",
    headers={
        "Authorization": f"Bearer {os.environ['AGENTMAIL_API_KEY']}",
        "Content-Type": "application/json"
    },
    json={
        "text": "Thanks for your email! Here's my reply..."
    }
)
```

## Notes

- Your inbox address is in `AGENTMAIL_INBOX_ID` (e.g., automna-abc123@agentmail.to)
- Emails sent from this address will show that as the sender
- Replies to your emails will arrive in your inbox
- Check inbox periodically for new messages or set up webhooks for real-time
