#!/usr/bin/env python3
"""
Check Agentmail inbox
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

try:
    from agentmail import AgentMail
except ImportError:
    print("Error: agentmail package not installed. Run: pip install agentmail")
    sys.exit(1)

def load_config():
    config_path = Path("/root/clawd/config/agentmail.json")
    if not config_path.exists():
        print(f"Error: Config not found at {config_path}")
        sys.exit(1)
    return json.loads(config_path.read_text())

def format_message(msg):
    """Format a message for display"""
    lines = [
        f"{'='*60}",
        f"ID: {msg.id}",
        f"From: {msg.from_address}",
        f"To: {', '.join(msg.to) if msg.to else 'N/A'}",
        f"Subject: {msg.subject}",
        f"Date: {msg.created_at}",
        f"Read: {'Yes' if msg.is_read else 'No'}",
        f"{'='*60}",
    ]
    if msg.text:
        lines.append(msg.text[:500] + ("..." if len(msg.text) > 500 else ""))
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Check Agentmail inbox")
    parser.add_argument("--unread", action="store_true", help="Show only unread messages")
    parser.add_argument("--message-id", help="Get specific message by ID")
    parser.add_argument("--limit", type=int, default=10, help="Max messages to show")
    args = parser.parse_args()

    config = load_config()
    client = AgentMail(api_key=config["api_key"])
    inbox_id = config["inbox_id"]

    try:
        if args.message_id:
            # Get specific message
            msg = client.inboxes.messages.get(
                inbox_id=inbox_id,
                message_id=args.message_id
            )
            print(format_message(msg))
        else:
            # List messages
            messages = client.inboxes.messages.list(
                inbox_id=inbox_id,
                limit=args.limit
            )
            
            if not messages.data:
                print("📭 Inbox is empty")
                return
            
            # Filter unread if requested
            msg_list = messages.data
            if args.unread:
                msg_list = [m for m in msg_list if not m.is_read]
                if not msg_list:
                    print("✅ No unread messages")
                    return
            
            print(f"📬 Found {len(msg_list)} message(s):\n")
            for msg in msg_list:
                print(format_message(msg))
                print()

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
