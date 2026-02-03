"use client";

import { useEffect, useState } from "react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Zap, DollarSign, Mail, Users, Activity } from "lucide-react";

interface UsageData {
  range: string;
  totals: {
    tokens: number;
    costMicro: number;  // microdollars
    requests: number;
    uniqueUsers: number;
    emails: number;
    uniqueSenders: number;
  };
  daily: Array<{
    date: string;
    inputTokens: number;
    outputTokens: number;
    costMicro: number;  // microdollars
    requests: number;
    emails: number;
  }>;
  byModel: Array<{
    model: string;
    tokens: number;
    costMicro: number;  // microdollars
    requests: number;
  }>;
  topUsers: Array<{
    userId: string;
    email: string;
    tokens: number;
    costMicro: number;  // microdollars
    requests: number;
  }>;
  topEmailSenders: Array<{
    userId: string;
    email: string;
    count: number;
  }>;
}

// Convert microdollars to dollars string
function formatMicrodollars(micro: number): string {
  const dollars = micro / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#6366f1"];

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-zinc-500">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-zinc-600">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatModel(model: string): string {
  // Shorten model names for display
  return model
    .replace("claude-", "")
    .replace("-20250514", "")
    .replace("-4-", "-4-");
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("7d");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/usage?range=${range}`);
        if (!res.ok) throw new Error("Failed to fetch usage data");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [range]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-zinc-800 rounded-xl"></div>
          ))}
        </div>
        <div className="h-80 bg-zinc-800 rounded-xl"></div>
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
        <h1 className="text-2xl font-bold">Usage Analytics</h1>
        <div className="flex gap-2">
          {["24h", "7d", "30d"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                range === r
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Tokens"
          value={data?.totals.tokens.toLocaleString() ?? 0}
          subtitle={`${data?.totals.uniqueUsers ?? 0} users`}
          icon={Zap}
        />
        <StatCard
          title="Total Cost"
          value={formatMicrodollars(data?.totals.costMicro ?? 0)}
          subtitle={`${data?.totals.requests ?? 0} requests`}
          icon={DollarSign}
        />
        <StatCard
          title="Emails Sent"
          value={data?.totals.emails ?? 0}
          subtitle={`${data?.totals.uniqueSenders ?? 0} senders`}
          icon={Mail}
        />
        <StatCard
          title="Active Users"
          value={data?.totals.uniqueUsers ?? 0}
          icon={Users}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Cost Over Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Cost Over Time</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="#71717a"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#71717a"
                  fontSize={12}
                  tickFormatter={(v) => formatMicrodollars(v)}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: "#18181b", 
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                  labelFormatter={(label) => formatDate(String(label))}
                  formatter={(value) => [formatMicrodollars(Number(value)), "Cost"]}
                />
                <Area
                  type="monotone"
                  dataKey="costMicro"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tokens Over Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Tokens Over Time</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="#71717a"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#71717a"
                  fontSize={12}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: "#18181b", 
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Area
                  type="monotone"
                  dataKey="inputTokens"
                  stackId="1"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.3}
                  name="Input"
                />
                <Area
                  type="monotone"
                  dataKey="outputTokens"
                  stackId="1"
                  stroke="#ec4899"
                  fill="#ec4899"
                  fillOpacity={0.3}
                  name="Output"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Model */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">By Model</h2>
          {data?.byModel && data.byModel.length > 0 ? (
            <div className="space-y-3">
              {data.byModel.map((model, i) => (
                <div key={model.model} className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {formatModel(model.model)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {model.requests.toLocaleString()} requests
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono">
                      {formatMicrodollars(model.costMicro)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {(model.tokens / 1000).toFixed(0)}k tokens
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No data</p>
          )}
        </div>

        {/* Top Users by Cost */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Top Users (Cost)</h2>
          {data?.topUsers && data.topUsers.length > 0 ? (
            <div className="space-y-2">
              {data.topUsers.slice(0, 5).map((user, i) => (
                <div key={user.userId} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{user.email}</div>
                  </div>
                  <div className="text-sm font-mono">
                    {formatMicrodollars(user.costMicro)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No data</p>
          )}
        </div>

        {/* Top Email Senders */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Top Email Senders</h2>
          {data?.topEmailSenders && data.topEmailSenders.length > 0 ? (
            <div className="space-y-2">
              {data.topEmailSenders.slice(0, 5).map((user, i) => (
                <div key={user.userId} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{user.email}</div>
                  </div>
                  <div className="text-sm font-mono">
                    {user.count} emails
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No data</p>
          )}
        </div>
      </div>
    </div>
  );
}
