/**
 * Bland.ai Voice Integration
 * 
 * Handles BYOT number import and inbound call configuration.
 */

const BLAND_API_KEY = process.env.BLAND_API_KEY!;
const BLAND_BYOT_KEY = process.env.BLAND_BYOT_KEY!;
const BLAND_API_URL = "https://api.bland.ai/v1";

// Default voice: Alexandra (young chirpy American female)
const DEFAULT_VOICE_ID = "6277266e-01eb-44c6-b965-438566ef7076";

/**
 * Import a Twilio number into Bland via BYOT.
 */
export async function importNumberToBland(phoneNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`${BLAND_API_URL}/inbound/insert`, {
      method: "POST",
      headers: {
        "Authorization": BLAND_API_KEY,
        "Content-Type": "application/json",
        "encrypted_key": BLAND_BYOT_KEY,
      },
      body: JSON.stringify({
        numbers: [phoneNumber],
      }),
    });

    if (!response.ok) {
      console.error("[bland] Failed to import number:", await response.text());
      return false;
    }

    const result = await response.json();
    console.log(`[bland] Imported number ${phoneNumber}:`, result);
    return true;
  } catch (error) {
    console.error("[bland] Import error:", error);
    return false;
  }
}

/**
 * Configure inbound call handling for a number.
 */
export async function configureInboundNumber(
  phoneNumber: string,
  config: {
    prompt: string;
    firstSentence?: string;
    voiceId?: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch(`${BLAND_API_URL}/inbound/${encodeURIComponent(phoneNumber)}`, {
      method: "POST",
      headers: {
        "Authorization": BLAND_API_KEY,
        "Content-Type": "application/json",
        "encrypted_key": BLAND_BYOT_KEY,
      },
      body: JSON.stringify({
        prompt: config.prompt,
        first_sentence: config.firstSentence || "Hello, how can I help you today?",
        voice: config.voiceId || DEFAULT_VOICE_ID,
        model: "base",
        language: "en-US",
        webhook: "https://automna.ai/api/webhooks/bland/status",
        record: true,
        background_track: "office",
      }),
    });

    if (!response.ok) {
      console.error("[bland] Failed to configure inbound:", await response.text());
      return false;
    }

    console.log(`[bland] Configured inbound for ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error("[bland] Configure error:", error);
    return false;
  }
}

/**
 * Remove a number from Bland.
 */
export async function removeNumberFromBland(phoneNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`${BLAND_API_URL}/inbound/${encodeURIComponent(phoneNumber)}`, {
      method: "DELETE",
      headers: {
        "Authorization": BLAND_API_KEY,
        "encrypted_key": BLAND_BYOT_KEY,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
