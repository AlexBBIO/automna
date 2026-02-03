"use client";

import { useEffect, useState } from "react";
import { Save, RefreshCw, AlertTriangle } from "lucide-react";

interface Settings {
  // Plan limits
  "limits.free.monthlyTokens": number;
  "limits.starter.monthlyTokens": number;
  "limits.pro.monthlyTokens": number;
  "limits.business.monthlyTokens": number;
  "limits.free.monthlyCostCents": number;
  "limits.starter.monthlyCostCents": number;
  "limits.pro.monthlyCostCents": number;
  "limits.business.monthlyCostCents": number;
  "limits.free.rpm": number;
  "limits.starter.rpm": number;
  "limits.pro.rpm": number;
  "limits.business.rpm": number;
  "limits.email.perDay": number;
  
  // Features
  "features.newUserProvisioning": boolean;
  "features.emailEnabled": boolean;
  "features.browserbaseEnabled": boolean;
  "features.heartbeatEnabled": boolean;
  
  // Maintenance
  "maintenance.enabled": boolean;
  "maintenance.message": string;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function SettingInput({ 
  label, 
  value, 
  onChange,
  type = "number",
  suffix,
}: { 
  label: string; 
  value: number | string;
  onChange: (value: number | string) => void;
  type?: "number" | "text";
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm text-zinc-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === "number" ? parseInt(e.target.value, 10) || 0 : e.target.value)}
          className="w-32 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-right focus:outline-none focus:border-zinc-600"
        />
        {suffix && <span className="text-xs text-zinc-500 w-12">{suffix}</span>}
      </div>
    </div>
  );
}

function SettingToggle({ 
  label, 
  description,
  checked, 
  onChange,
}: { 
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-zinc-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-zinc-700"
        }`}
      >
        <div 
          className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [original, setOriginal] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const json = await res.json();
      setSettings(json.settings);
      setOriginal(json.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function saveSettings() {
    if (!settings || !original) return;
    
    // Find what changed
    const changes: Partial<Settings> = {};
    for (const key of Object.keys(settings) as (keyof Settings)[]) {
      if (settings[key] !== original[key]) {
        changes[key] = settings[key] as any;
      }
    }

    if (Object.keys(changes).length === 0) {
      return; // Nothing to save
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      if (!res.ok) throw new Error("Failed to save settings");
      
      setOriginal(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  }

  const hasChanges = settings && original && 
    JSON.stringify(settings) !== JSON.stringify(original);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-32 mb-6"></div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex items-center gap-3">
          {success && (
            <span className="text-green-400 text-sm">✓ Saved</span>
          )}
          {error && (
            <span className="text-red-400 text-sm">{error}</span>
          )}
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={saveSettings}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Maintenance Mode */}
      {settings?.["maintenance.enabled"] && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-yellow-400">Maintenance Mode Active</div>
            <div className="text-sm text-yellow-500/80">Users will see the maintenance message instead of the app.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Limits - Tokens */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Token Limits (Monthly)</h2>
          <div className="divide-y divide-zinc-800">
            <SettingInput
              label="Free"
              value={settings?.["limits.free.monthlyTokens"] ?? 0}
              onChange={(v) => updateSetting("limits.free.monthlyTokens", v as number)}
              suffix={formatNumber(settings?.["limits.free.monthlyTokens"] ?? 0)}
            />
            <SettingInput
              label="Starter"
              value={settings?.["limits.starter.monthlyTokens"] ?? 0}
              onChange={(v) => updateSetting("limits.starter.monthlyTokens", v as number)}
              suffix={formatNumber(settings?.["limits.starter.monthlyTokens"] ?? 0)}
            />
            <SettingInput
              label="Pro"
              value={settings?.["limits.pro.monthlyTokens"] ?? 0}
              onChange={(v) => updateSetting("limits.pro.monthlyTokens", v as number)}
              suffix={formatNumber(settings?.["limits.pro.monthlyTokens"] ?? 0)}
            />
            <SettingInput
              label="Business"
              value={settings?.["limits.business.monthlyTokens"] ?? 0}
              onChange={(v) => updateSetting("limits.business.monthlyTokens", v as number)}
              suffix={formatNumber(settings?.["limits.business.monthlyTokens"] ?? 0)}
            />
          </div>
        </div>

        {/* Plan Limits - Cost */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Cost Caps (Monthly)</h2>
          <div className="divide-y divide-zinc-800">
            <SettingInput
              label="Free"
              value={settings?.["limits.free.monthlyCostCents"] ?? 0}
              onChange={(v) => updateSetting("limits.free.monthlyCostCents", v as number)}
              suffix={`$${((settings?.["limits.free.monthlyCostCents"] ?? 0) / 100).toFixed(0)}`}
            />
            <SettingInput
              label="Starter"
              value={settings?.["limits.starter.monthlyCostCents"] ?? 0}
              onChange={(v) => updateSetting("limits.starter.monthlyCostCents", v as number)}
              suffix={`$${((settings?.["limits.starter.monthlyCostCents"] ?? 0) / 100).toFixed(0)}`}
            />
            <SettingInput
              label="Pro"
              value={settings?.["limits.pro.monthlyCostCents"] ?? 0}
              onChange={(v) => updateSetting("limits.pro.monthlyCostCents", v as number)}
              suffix={`$${((settings?.["limits.pro.monthlyCostCents"] ?? 0) / 100).toFixed(0)}`}
            />
            <SettingInput
              label="Business"
              value={settings?.["limits.business.monthlyCostCents"] ?? 0}
              onChange={(v) => updateSetting("limits.business.monthlyCostCents", v as number)}
              suffix={`$${((settings?.["limits.business.monthlyCostCents"] ?? 0) / 100).toFixed(0)}`}
            />
          </div>
        </div>

        {/* Rate Limits */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Rate Limits (RPM)</h2>
          <div className="divide-y divide-zinc-800">
            <SettingInput
              label="Free"
              value={settings?.["limits.free.rpm"] ?? 0}
              onChange={(v) => updateSetting("limits.free.rpm", v as number)}
              suffix="req/min"
            />
            <SettingInput
              label="Starter"
              value={settings?.["limits.starter.rpm"] ?? 0}
              onChange={(v) => updateSetting("limits.starter.rpm", v as number)}
              suffix="req/min"
            />
            <SettingInput
              label="Pro"
              value={settings?.["limits.pro.rpm"] ?? 0}
              onChange={(v) => updateSetting("limits.pro.rpm", v as number)}
              suffix="req/min"
            />
            <SettingInput
              label="Business"
              value={settings?.["limits.business.rpm"] ?? 0}
              onChange={(v) => updateSetting("limits.business.rpm", v as number)}
              suffix="req/min"
            />
          </div>
          <div className="pt-4 border-t border-zinc-800 mt-4">
            <SettingInput
              label="Emails per day"
              value={settings?.["limits.email.perDay"] ?? 0}
              onChange={(v) => updateSetting("limits.email.perDay", v as number)}
              suffix="per user"
            />
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Feature Flags</h2>
          <div className="divide-y divide-zinc-800">
            <SettingToggle
              label="New User Provisioning"
              description="Allow new users to create machines"
              checked={settings?.["features.newUserProvisioning"] ?? true}
              onChange={(v) => updateSetting("features.newUserProvisioning", v)}
            />
            <SettingToggle
              label="Email"
              description="Enable email sending for agents"
              checked={settings?.["features.emailEnabled"] ?? true}
              onChange={(v) => updateSetting("features.emailEnabled", v)}
            />
            <SettingToggle
              label="Browserbase"
              description="Enable browser automation"
              checked={settings?.["features.browserbaseEnabled"] ?? true}
              onChange={(v) => updateSetting("features.browserbaseEnabled", v)}
            />
            <SettingToggle
              label="Heartbeat"
              description="Enable periodic agent heartbeats"
              checked={settings?.["features.heartbeatEnabled"] ?? true}
              onChange={(v) => updateSetting("features.heartbeatEnabled", v)}
            />
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Maintenance Mode</h2>
          <div className="space-y-4">
            <SettingToggle
              label="Enable Maintenance Mode"
              description="Show maintenance page to all users"
              checked={settings?.["maintenance.enabled"] ?? false}
              onChange={(v) => updateSetting("maintenance.enabled", v)}
            />
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Maintenance Message</label>
              <textarea
                value={settings?.["maintenance.message"] ?? ""}
                onChange={(e) => updateSetting("maintenance.message", e.target.value)}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 resize-none"
                placeholder="We're performing scheduled maintenance..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
