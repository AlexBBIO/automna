"use client";

import { useEffect, useState } from "react";
import { Users, Zap, Mail, Server, DollarSign, MessageSquare } from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  activeUsers24h: number;
  activeMachines: number;
  totalMachines: number;
  apiCostTodayMicro: number;  // microdollars
  apiCostMonthMicro: number;  // microdollars
  emailsToday: number;
  emailsMonth: number;
  tokensToday: number;
  tokensMonth: number;
}

// Convert microdollars to dollars string
function formatMicrodollars(micro: number): string {
  const dollars = micro / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  color = "blue"
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: React.ElementType;
  color?: "blue" | "green" | "orange" | "purple" | "red";
}) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-green-500/10 text-green-500",
    orange: "bg-orange-500/10 text-orange-500",
    purple: "bg-purple-500/10 text-purple-500",
    red: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-zinc-600 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-zinc-800 rounded-xl"></div>
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
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers ?? 0}
          subtitle={`${stats?.activeUsers24h ?? 0} active in last 24h`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Active Machines"
          value={`${stats?.activeMachines ?? 0} / ${stats?.totalMachines ?? 0}`}
          subtitle="Running on Fly.io"
          icon={Server}
          color="green"
        />
        <StatCard
          title="API Cost Today"
          value={formatMicrodollars(stats?.apiCostTodayMicro ?? 0)}
          subtitle={`${formatMicrodollars(stats?.apiCostMonthMicro ?? 0)} this month`}
          icon={DollarSign}
          color="orange"
        />
        <StatCard
          title="Tokens Today"
          value={(stats?.tokensToday ?? 0).toLocaleString()}
          subtitle={`${(stats?.tokensMonth ?? 0).toLocaleString()} this month`}
          icon={Zap}
          color="purple"
        />
        <StatCard
          title="Emails Today"
          value={stats?.emailsToday ?? 0}
          subtitle={`${stats?.emailsMonth ?? 0} this month`}
          icon={Mail}
          color="blue"
        />
        <StatCard
          title="Messages"
          value="—"
          subtitle="Coming soon"
          icon={MessageSquare}
          color="purple"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <p className="text-zinc-500 text-sm">Activity log coming in Phase 3</p>
      </div>
    </div>
  );
}
