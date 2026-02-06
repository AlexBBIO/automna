/**
 * Twilio Phone Number Management
 * 
 * Handles provisioning and releasing US local phone numbers.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function twilioAuth(): string {
  return "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
}

/**
 * Search for and purchase an available US local phone number.
 * Tries the preferred area code first, falls back to any US number.
 */
export async function provisionPhoneNumber(preferredAreaCode?: string): Promise<{
  phoneNumber: string;
  sid: string;
}> {
  // Search for available numbers
  let searchUrl = `${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/US/Local.json?Limit=5`;
  if (preferredAreaCode) {
    searchUrl += `&AreaCode=${preferredAreaCode}`;
  }

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: twilioAuth() },
  });

  if (!searchResponse.ok) {
    throw new Error(`Twilio search failed: ${await searchResponse.text()}`);
  }

  let available = (await searchResponse.json()).available_phone_numbers;

  // If preferred area code has no results, try without
  if ((!available || available.length === 0) && preferredAreaCode) {
    const fallbackUrl = `${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/US/Local.json?Limit=5`;
    const fallbackResponse = await fetch(fallbackUrl, {
      headers: { Authorization: twilioAuth() },
    });
    if (fallbackResponse.ok) {
      available = (await fallbackResponse.json()).available_phone_numbers;
    }
  }

  if (!available || available.length === 0) {
    throw new Error("No available phone numbers found");
  }

  // Try to purchase each number (they can be snatched between search and buy)
  for (const number of available) {
    try {
      const purchaseResponse = await fetch(
        `${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuth(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            PhoneNumber: number.phone_number,
            FriendlyName: "Automna User",
          }),
        }
      );

      if (purchaseResponse.ok) {
        const purchased = await purchaseResponse.json();
        return {
          phoneNumber: purchased.phone_number,
          sid: purchased.sid,
        };
      }

      // Number was taken, try next
      console.warn(`[twilio] Number ${number.phone_number} unavailable, trying next`);
    } catch {
      continue;
    }
  }

  throw new Error("Failed to purchase any available phone number");
}

/**
 * Release a phone number back to Twilio.
 */
export async function releasePhoneNumber(sid: string): Promise<void> {
  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
    {
      method: "DELETE",
      headers: { Authorization: twilioAuth() },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to release phone number: ${await response.text()}`);
  }
}
