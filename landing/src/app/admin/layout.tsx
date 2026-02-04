"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  CreditCard, 
  Activity,
  Settings,
  ArrowLeft,
  Megaphone
} from "lucide-react";
import { ADMIN_USER_IDS } from "@/lib/admin";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/health", label: "Health", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (!userId) {
        router.push("/sign-in");
        return;
      }
      
      // Check if user is admin
      const adminCheck = ADMIN_USER_IDS.includes(userId);
      setIsAdmin(adminCheck);
      
      if (!adminCheck) {
        router.push("/dashboard");
      }
    }
  }, [isLoaded, userId, router]);

  // Loading state
  if (!isLoaded || isAdmin === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  // Not admin - will redirect
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-red-500">Access denied</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard" 
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-orange-500">🔒</span>
              <span className="font-semibold">Automna Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user?.emailAddresses[0]?.emailAddress}</span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-56 border-r border-zinc-800 min-h-[calc(100vh-57px)] bg-zinc-900/30 p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
