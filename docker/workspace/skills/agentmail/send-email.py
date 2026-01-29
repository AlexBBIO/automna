#!/usr/bin/env python3
"""
Send email via Agentmail API
"""

import argparse
import json
import sys
from pathlib import Path

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

def main():
    parser = argparse.ArgumentParser(description="Send email via Agentmail")
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", required=True, help="Email body (plain text)")
    parser.add_argument("--cc", help="CC recipient(s), comma-separated")
    parser.add_argument("--bcc", help="BCC recipient(s), comma-separated")
    args = parser.parse_args()

    config = load_config()
    client = AgentMail(api_key=config["api_key"])
    
    # Build recipients
    to_list = [addr.strip() for addr in args.to.split(",")]
    cc_list = [addr.strip() for addr in args.cc.split(",")] if args.cc else None
    bcc_list = [addr.strip() for addr in args.bcc.split(",")] if args.bcc else None

    try:
        result = client.send(
            inbox_id=config["inbox_id"],
            to=to_list,
            subject=args.subject,
            text=args.body,
            cc=cc_list,
            bcc=bcc_list,
        )
        print(f"✅ Email sent successfully!")
        print(f"   To: {args.to}")
        print(f"   Subject: {args.subject}")
        if hasattr(result, 'id'):
            print(f"   Message ID: {result.id}")
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
