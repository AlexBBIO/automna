#!/bin/bash
# Provision phone numbers for existing starter users
# This is a one-time script. Safe to run multiple times (checks for existing numbers).

set -e

TWILIO_SID=$(cat /root/clawd/projects/automna/config/twilio.json | python3 -c "import json,sys; print(json.load(sys.stdin)['accountSid'])")
TWILIO_TOKEN=$(cat /root/clawd/projects/automna/config/twilio.json | python3 -c "import json,sys; print(json.load(sys.stdin)['authToken'])")
BLAND_KEY=$(cat /root/clawd/projects/automna/config/bland.json | python3 -c "import json,sys; print(json.load(sys.stdin)['apiKey'])")
BLAND_ENC=$(cat /root/clawd/projects/automna/config/bland.json | python3 -c "import json,sys; print(json.load(sys.stdin)['encryptedKey'])")
TURSO_URL=$(cat /root/clawd/projects/automna/config/turso.json | python3 -c "import sys,json; u=json.load(sys.stdin)['url']; print(u.replace('libsql://','https://'))")
TURSO_TOKEN=$(cat /root/clawd/projects/automna/config/turso.json | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
TWILIO_CREDS="$TWILIO_SID:$TWILIO_TOKEN"

USERS=(
  "user_38x8dqsjcki066dwvps9XttSUKA"
  "user_39E7i31yWuSShbhVCihWLTw5Mss"
  "user_39Ecy0LGp6nzaN2I549I4uOI7UO"
  "user_39HECCldnsbi1nQpI3OE8rUACRH"
  "user_39HGl5MRUxxYkgsKW4ZmC8DwlrB"
  "user_39M0K405cfmjqjV9LK22uCUIaJs"
)

for USER_ID in "${USERS[@]}"; do
  echo "=== Provisioning for $USER_ID ==="
  
  # 1. Search for available 725 number
  echo "  Searching for available number..."
  SEARCH=$(curl -s "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/AvailablePhoneNumbers/US/Local.json?AreaCode=725&Limit=1" \
    -u "$TWILIO_CREDS")
  
  PHONE=$(echo "$SEARCH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['available_phone_numbers'][0]['phone_number'])" 2>/dev/null)
  
  if [ -z "$PHONE" ]; then
    echo "  No 725 numbers available, trying any..."
    SEARCH=$(curl -s "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/AvailablePhoneNumbers/US/Local.json?Limit=1" \
      -u "$TWILIO_CREDS")
    PHONE=$(echo "$SEARCH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['available_phone_numbers'][0]['phone_number'])")
  fi
  
  echo "  Found: $PHONE"
  
  # 2. Purchase the number
  echo "  Purchasing..."
  PURCHASE=$(curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/IncomingPhoneNumbers.json" \
    -u "$TWILIO_CREDS" \
    -d "PhoneNumber=$PHONE")
  
  SID=$(echo "$PURCHASE" | python3 -c "import json,sys; print(json.load(sys.stdin)['sid'])")
  echo "  Purchased: $PHONE (SID: $SID)"
  
  # 3. Import to Bland
  echo "  Importing to Bland..."
  BLAND_IMPORT=$(curl -s -X POST "https://api.bland.ai/v1/inbound/$PHONE" \
    -H "Authorization: $BLAND_KEY" \
    -H "encrypted_key: $BLAND_ENC" \
    -H "Content-Type: application/json" \
    -d '{
      "prompt": "You are a helpful AI assistant. You answer phone calls on behalf of your user. Be friendly, professional, and helpful. If someone is calling for the user, take a message including their name, what it is regarding, and a callback number. Keep responses concise and natural.",
      "first_sentence": "Hello, you have reached an AI assistant. How can I help you?",
      "voice": "6277266e-01eb-44c6-b965-438566ef7076",
      "wait_for_greeting": true
    }')
  
  BLAND_OK=$(echo "$BLAND_IMPORT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','ok'))" 2>/dev/null)
  echo "  Bland import: $BLAND_OK"
  
  # 4. Insert into database
  echo "  Saving to database..."
  UUID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
  TIMESTAMP=$(python3 -c "import time; print(int(time.time()))")
  
  curl -s "$TURSO_URL/v2/pipeline" \
    -H "Authorization: Bearer $TURSO_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"INSERT INTO phone_numbers (id, user_id, phone_number, twilio_sid, bland_imported, agent_name, voice_id, inbound_prompt, inbound_first_sentence, created_at) VALUES ('$UUID', '$USER_ID', '$PHONE', '$SID', 1, 'AI Assistant', '6277266e-01eb-44c6-b965-438566ef7076', 'You are a helpful AI assistant...', 'Hello, you have reached an AI assistant. How can I help you?', $TIMESTAMP)\"}},{\"type\":\"close\"}]}" > /dev/null
  
  echo "  ✓ Done: $USER_ID → $PHONE"
  echo ""
  
  # Small delay between provisions
  sleep 2
done

echo "=== All done! ==="
