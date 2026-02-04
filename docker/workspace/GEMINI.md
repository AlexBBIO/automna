# Gemini - Google AI Capabilities

You have access to Google's Gemini models through Automna's proxy.

**No API key needed** - your gateway token handles authentication automatically.

## Using the Gemini SDK

```python
import google.generativeai as genai
import os

# Configure with gateway token (proxy handles the real key)
genai.configure(
    api_key=os.environ["GEMINI_API_KEY"],
    transport="rest"  # Required for proxy
)

# Use any Gemini model
model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content("Explain quantum computing in simple terms")
print(response.text)
```

## Available Models

| Model | Best For |
|-------|----------|
| `gemini-2.0-flash` | Fast responses, general tasks |
| `gemini-2.0-flash-thinking` | Complex reasoning |
| `gemini-1.5-pro` | Long context, detailed analysis |
| `gemini-1.5-flash` | Quick, efficient responses |

## Image Generation (Imagen)

```python
from google import genai as genai_client

client = genai_client.Client(api_key=os.environ["GEMINI_API_KEY"])

response = client.models.generate_images(
    model="imagen-3.0-generate-002",
    prompt="A serene mountain landscape at sunset",
    config={
        "number_of_images": 1,
        "aspect_ratio": "16:9"
    }
)

# Save the image
for i, image in enumerate(response.generated_images):
    with open(f"image_{i}.png", "wb") as f:
        f.write(image.image.image_bytes)
```

## Vision (Analyze Images)

```python
import PIL.Image

model = genai.GenerativeModel("gemini-2.0-flash")
image = PIL.Image.open("photo.jpg")

response = model.generate_content([
    "What's in this image? Describe it in detail.",
    image
])
print(response.text)
```

## Chat Conversations

```python
model = genai.GenerativeModel("gemini-2.0-flash")
chat = model.start_chat()

response = chat.send_message("Hi! I'm working on a Python project.")
print(response.text)

response = chat.send_message("Can you help me optimize this function?")
print(response.text)
```

## Environment Variables

| Variable | Value |
|----------|-------|
| `GEMINI_API_KEY` | Your gateway token (auto-configured) |
| `GOOGLE_API_KEY` | Same as above (SDK alias) |
| `GOOGLE_API_BASE_URL` | `https://automna.ai/api/gemini` |

## Notes

- All requests route through Automna's proxy for usage tracking
- Your gateway token authenticates everything
- No rate limits beyond standard Gemini quotas
- Supports all Gemini API features (text, vision, embeddings, etc.)
