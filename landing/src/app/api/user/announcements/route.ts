/**
 * User Announcements API
 * 
 * Returns announcements the user should see (hasn't dismissed current version)
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements, announcementDismissals, machines } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has a machine (determines if they're "new")
    const userMachine = await db.query.machines.findFirst({
      where: eq(machines.userId, userId),
    });
    const isNewUser = !userMachine;

    // Get all enabled announcements
    const allAnnouncements = await db.query.announcements.findMany({
      where: eq(announcements.enabled, true),
    });

    // Get user's dismissals
    const userDismissals = await db.query.announcementDismissals.findMany({
      where: eq(announcementDismissals.userId, userId),
    });

    const dismissalMap = new Map(
      userDismissals.map(d => [d.announcementId, d.dismissedVersion])
    );

    // Filter to announcements user should see
    const toShow = allAnnouncements.filter(ann => {
      // Check if user dismissed this version
      const dismissedVersion = dismissalMap.get(ann.id);
      if (dismissedVersion && dismissedVersion >= (ann.version || 1)) {
        return false; // Already dismissed this version
      }

      // For new_user type, only show to users without a machine
      // (shown during/after first provision)
      if (ann.type === 'new_user') {
        return isNewUser;
      }

      // all_users type: show to everyone
      return true;
    });

    // Sort: new_user first, then by creation date
    toShow.sort((a, b) => {
      if (a.type === 'new_user' && b.type !== 'new_user') return -1;
      if (b.type === 'new_user' && a.type !== 'new_user') return 1;
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    });

    return NextResponse.json({
      announcements: toShow.map(ann => ({
        id: ann.id,
        type: ann.type,
        title: ann.title,
        content: ann.content,
        version: ann.version,
      })),
      isNewUser,
    });

  } catch (error) {
    console.error("[announcements] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
