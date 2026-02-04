/**
 * Admin configuration
 * 
 * Single source of truth for admin user IDs
 */

export const ADMIN_USER_IDS = [
  "user_39BOckCUY80kC6t1LLgZF6t2SPw", // grandathrawn@gmail.com (prod)
];

export function isAdmin(userId: string | null | undefined): boolean {
  return !!userId && ADMIN_USER_IDS.includes(userId);
}
