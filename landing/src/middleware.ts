import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
