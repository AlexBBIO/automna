import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define protected routes (dashboard and anything under it)
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

// Define public routes (landing, auth pages, API)
const isPublicRoute = createRouteMatcher([
  "/",
  "/clawd",
  "/privacy",
  "/terms",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Protect dashboard routes
  if (isProtectedRoute(req)) {
    await auth.protect();

    // If user just completed Stripe checkout, let them through
    // (webhook may not have updated subscription status yet)
    const url = new URL(req.url);
    if (url.searchParams.get("success") === "true") {
      return;
    }

    // Check subscription status from session claims
    // Requires Clerk Dashboard → Sessions → Customize session token with:
    // { "subscriptionStatus": "{{user.public_metadata.subscriptionStatus}}" }
    const { sessionClaims } = await auth();
    const subscriptionStatus = (sessionClaims as Record<string, unknown>)?.subscriptionStatus as string | undefined;

    if (subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
      // No active subscription — send to pricing page
      const pricingUrl = new URL("/pricing", req.url);
      pricingUrl.searchParams.set("subscribe", "true");
      return NextResponse.redirect(pricingUrl);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
