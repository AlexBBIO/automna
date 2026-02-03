"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Filter } from "lucide-react";

interface UserRow {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  plan: string;
  machineStatus: string | null;
  appName: string | null;
  apiCostMonth: number;
  emailsToday: number;
  lastActiveAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-400">No machine</span>;
  }
  
  const colors: Record<string, string> = {
    started: "bg-green-500/20 text-green-400",
    stopped: "bg-yellow-500/20 text-yellow-400",
    created: "bg-blue-500/20 text-blue-400",
    destroyed: "bg-red-500/20 text-red-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${colors[status] || "bg-zinc-700 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: "bg-zinc-700 text-zinc-300",
    starter: "bg-blue-500/20 text-blue-400",
    pro: "bg-purple-500/20 text-purple-400",
    business: "bg-orange-500/20 text-orange-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${colors[plan] || "bg-zinc-700 text-zinc-300"}`}>
      {plan}
    </span>
  );
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = await res.json();
        setUsers(data.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(user => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      user.email?.toLowerCase().includes(searchLower) ||
      user.name?.toLowerCase().includes(searchLower) ||
      user.appName?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-32 mb-6"></div>
        <div className="h-12 bg-zinc-800 rounded mb-4"></div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <span className="text-sm text-zinc-500">{users.length} total</span>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by email, name, or app..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">API Cost (MTD)</th>
              <th className="px-4 py-3 font-medium text-right">Emails Today</th>
              <th className="px-4 py-3 font-medium">Last Active</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium">{user.name || "—"}</div>
                    <div className="text-sm text-zinc-500">{user.email}</div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={user.plan} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.machineStatus} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  ${(user.apiCostMonth / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  {user.emailsToday}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-400">
                  {formatTimeAgo(user.lastActiveAt)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/users/${user.clerkId}`}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-500">
            No users found
          </div>
        )}
      </div>
    </div>
  );
}
