'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

// Integration data with categories
const integrations = {
  chat: [
    { name: 'Slack', icon: '/integrations/slack.svg' },
    { name: 'Discord', icon: '/integrations/discord.svg' },
    { name: 'Telegram', icon: '/integrations/telegram.svg' },
    { name: 'WhatsApp', icon: '/integrations/whatsapp.svg' },
  ],
  work: [
    { name: 'Notion', icon: '/integrations/notion.svg' },
    { name: 'Trello', icon: '/integrations/trello.svg' },
    { name: 'Obsidian', icon: '/integrations/obsidian.svg' },
  ],
  dev: [
    { name: 'GitHub', icon: '/integrations/github.svg' },
  ],
  email: [
    { name: 'Email', icon: '/integrations/email.svg' },
  ],
};

// Demo tabs data
const demoTabs = [
  {
    id: 'ship-feature',
    tabLabel: 'Ship a feature',
    title: 'Ship a feature from plain English.',
    oneLiner: 'Describe the change, share the repo context, and let the agent produce a reviewable PR.',
    trigger: 'Describe the feature and acceptance criteria.',
    actions: 'Scan codebase → plan → implement → test → open PR.',
    deliverable: 'PR draft + tests + changelog, ready for review.',
    steps: [
      'You describe the feature and acceptance criteria',
      'The agent scans the codebase and proposes a plan',
      'It implements, tests, and opens a PR',
      'You review the diff and merge when ready',
    ],
    outputs: [
      'Pull request with commits and diff',
      'Tests (or a clear note on what couldn\'t be tested)',
      'Release notes / changelog draft',
      'Run log of actions taken',
    ],
    buttonText: 'View sample run',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Ship feature from spec',
    logLines: [
      'agent: Reading requirements…',
      'agent: Scanning repo structure…',
      'agent: Implementing changes on branch automna/feature-billing-link…',
      'agent: Updating tests and docs…',
      'agent: PR draft ready for review.',
    ],
    deliverableCard: {
      label: 'PULL REQUEST READY',
      title: 'Add Billing Portal link to Settings',
      bullets: [
        'Files: settings.tsx, billing.ts, README.md',
        'Tests: billing.test.ts updated',
        'How to test: npm test (or repo command)',
      ],
      primaryBtn: 'Approve & open PR',
      secondaryBtn: 'View diff',
      footer: 'Approval required before pushing to GitHub.',
    },
  },
  {
    id: 'research-brief',
    tabLabel: 'Research brief',
    title: 'Deep research, structured output.',
    oneLiner: 'Ask a question. Get a sourced brief with findings organized for decision-making.',
    trigger: 'Describe the research question and scope.',
    actions: 'Search → read sources → cross-reference → synthesize → format brief.',
    deliverable: '1-page brief + sources + spreadsheet of findings.',
    steps: [
      'Describe the research question and scope',
      'The agent searches and reads primary sources',
      'It cross-references claims and synthesizes findings',
      'You receive a formatted brief with sources',
    ],
    outputs: [
      '1-page brief with key findings',
      'Linked and annotated sources',
      'Comparison matrix spreadsheet (CSV)',
      'Run log of actions taken',
    ],
    buttonText: 'View sample run',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Research competitive landscape',
    logLines: [
      'agent: Searching primary sources…',
      'agent: Reading 14 articles and reports…',
      'agent: Cross-referencing claims…',
      'agent: Synthesizing findings…',
      'agent: Brief ready for review.',
    ],
    deliverableCard: {
      label: 'RESEARCH BRIEF READY',
      title: 'Competitive landscape · 14 sources analyzed',
      bullets: [
        'Brief: 1-page summary with key findings',
        'Sources: linked and annotated',
        'Spreadsheet: comparison matrix (CSV)',
      ],
      primaryBtn: 'Download brief',
      secondaryBtn: 'View sources',
      footer: 'Sources included for every claim.',
    },
  },
  {
    id: 'weekly-ops-report',
    tabLabel: 'Weekly ops report',
    title: 'Automated weekly ops report.',
    oneLiner: 'Pull metrics, summarize status, and draft the update your team expects.',
    trigger: 'Run weekly (or on-demand) with connected tools.',
    actions: 'Pull metrics → summarize changes → draft report → format for distribution.',
    deliverable: 'Report + Slack update draft + slide summary.',
    steps: [
      'Connect your metrics sources and set the schedule',
      'The agent pulls data and compares to last period',
      'It drafts a summary with highlights and changes',
      'You review and approve for distribution',
    ],
    outputs: [
      'Formatted report with highlights',
      'Slack draft ready to post',
      'Metrics compared to last week',
      'Run log of actions taken',
    ],
    buttonText: 'View sample run',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Weekly ops report',
    logLines: [
      'agent: Pulling metrics from connected tools…',
      'agent: Comparing to last week…',
      'agent: Drafting summary…',
      'agent: Formatting for Slack and docs…',
      'agent: Report ready.',
    ],
    deliverableCard: {
      label: 'REPORT READY',
      title: 'Weekly ops · Week of Feb 3',
      bullets: [
        'Metrics: pulled and compared to last week',
        'Report: formatted doc with highlights',
        'Slack draft: ready to post in #team-updates',
      ],
      primaryBtn: 'Approve & send',
      secondaryBtn: 'Edit report',
      footer: 'Approval required before posting.',
    },
  },
  {
    id: 'inbox-triage',
    tabLabel: 'Inbox triage',
    title: 'Never drop a follow-up.',
    oneLiner: 'Turn email threads into drafted replies and a prioritized task list—automatically.',
    trigger: 'Monitor a label/folder like "Follow Up" or "Important".',
    actions: 'Summarize → extract action items → draft replies → create tasks.',
    deliverable: 'Reply drafts + task list + digest, ready for approval.',
    steps: [
      'Set a label or folder to monitor',
      'The agent summarizes threads and extracts action items',
      'It drafts replies and creates tasks',
      'You review and approve before anything sends',
    ],
    outputs: [
      'Concise reply drafts with context',
      'Prioritized task list with due dates',
      'Daily digest ready to send',
      'Run log of actions taken',
    ],
    buttonText: 'View sample run',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Inbox → done',
    logLines: [
      'agent: Scanning inbox filter "Follow Up"…',
      'agent: Found 12 threads…',
      'agent: Drafted 7 replies…',
      'agent: Created 5 tasks in Automna Follow-ups…',
      'agent: Daily digest ready for review.',
    ],
    deliverableCard: {
      label: 'DRAFTS READY',
      title: '7 replies + 5 tasks prepared',
      bullets: [
        'Replies: concise drafts with context',
        'Tasks: priority + due date suggestions',
        'Digest: ready to post/send',
      ],
      primaryBtn: 'Approve & send digest',
      secondaryBtn: 'Review drafts',
      footer: 'Approval required before sending emails or posting digests.',
    },
  },
];

// Features data
const features = [
  { title: 'Web sandbox + browser', description: 'Run controlled web sessions to complete multi-step workflows in real tools.' },
  { title: 'Draft + merge requests', description: 'Open PRs with diffs and notes. Keep merges behind approvals.' },
  { title: 'Real deliverables', description: 'Get docs, sheets, PRs, tickets, and reports—not summaries that you still have to implement.' },
  { title: 'Approval gates', description: 'Require confirmation before sending emails, posting messages, merging code, or changing records.' },
  { title: 'Schedules + triggers', description: 'Run recurring jobs (daily/weekly) or kick off tasks from events and webhooks.' },
  { title: 'Version history', description: 'Track what changed across runs. Re-run, compare, and revert outputs when needed.' },
  { title: 'API-ready', description: 'Start runs programmatically and plug agents into your existing systems.' },
  { title: 'Run logs', description: 'See every action the agent took and why. Export logs when you need an audit trail.' },
];

// FAQ data
const faqItems = [
  { q: 'What do agents actually deliver?', a: 'Finished artifacts—PRs, docs, reports, spreadsheets—plus a run log of what was done.' },
  { q: 'How do approvals work?', a: 'You can require confirmation before sensitive actions (sending, writing, merging). Agents queue requests instead of acting silently.' },
  { q: 'What tools can Automna use?', a: 'Automna works through connected integrations and a controlled browser. Connect only what you want via OAuth.' },
  { q: 'Where do tasks run?', a: 'In the cloud. Runs can be started on-demand or on schedules and triggers (depending on plan).' },
  { q: 'What happens if the agent gets something wrong?', a: 'You review outputs before they ship. Runs include logs and version history so you can inspect and redo work safely.' },
  { q: 'Can I revoke access?', a: 'Yes. Disconnect tools at any time. Permissions are scoped to what you explicitly connect.' },
  { q: 'Can I cancel or change plans?', a: 'Yes—upgrade/downgrade anytime. Cancel monthly plans when you\'re done.' },
];

export default function Landing4() {
  const [isVisible, setIsVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const demoCarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
    
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Terminal mock component (reused in hero and demo)
  const TerminalMock = ({ tab, compact = false }: { tab: typeof demoTabs[0], compact?: boolean }) => (
    <div className={`bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800 ${compact ? 'p-4' : 'p-5'} shadow-2xl`}>
      {/* Terminal header */}
      <div className={`flex items-center justify-between ${compact ? 'mb-3 pb-3' : 'mb-4 pb-4'} border-b border-zinc-800`}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-500/80"></div>
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-green-500/80"></div>
          </div>
          <span className="text-zinc-500 text-xs md:text-sm">automna agent</span>
        </div>
        <div className="flex items-center gap-2">
          {tab.statusBadge === 'running' ? (
            <>
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-emerald-400/80 text-xs font-medium">running</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              <span className="text-amber-400/80 text-xs font-medium">preview</span>
            </>
          )}
        </div>
      </div>

      {/* Task header */}
      <div className={`font-mono text-xs md:text-sm ${compact ? 'mb-3' : 'mb-4'}`}>
        <div className="flex gap-3">
          <span className="text-purple-400 shrink-0">task:</span>
          <span className="text-zinc-300">{tab.headerLine.replace('task: ', '')}</span>
        </div>
      </div>

      {/* Log lines */}
      <div className={`space-y-1.5 md:space-y-2 font-mono text-xs md:text-sm ${compact ? 'mb-3' : 'mb-4'}`}>
        {(compact ? tab.logLines.slice(-3) : tab.logLines).map((line, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-emerald-400 shrink-0">agent:</span>
            <span className="text-zinc-400">{line.replace('agent: ', '')}</span>
          </div>
        ))}
      </div>

      {/* Deliverable card */}
      <div className={`${compact ? 'my-3 p-3' : 'my-4 p-4'} bg-zinc-800/50 rounded-lg border border-zinc-700`}>
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">{tab.deliverableCard.label}</div>
        <div className="text-zinc-200 text-xs md:text-sm font-medium mb-2">{tab.deliverableCard.title}</div>
        <div className="space-y-0.5 mb-3">
          {(compact ? tab.deliverableCard.bullets.slice(0, 2) : tab.deliverableCard.bullets).map((bullet, i) => (
            <div key={i} className="text-xs text-zinc-400">• {bullet}</div>
          ))}
        </div>
        <div className="flex gap-2 md:gap-3">
          <div className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg font-medium">
            {tab.deliverableCard.primaryBtn}
          </div>
          <div className="px-3 py-1.5 border border-zinc-700 text-zinc-400 text-xs rounded-lg">
            {tab.deliverableCard.secondaryBtn}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white antialiased transition-colors">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-50/50 via-transparent to-violet-50/30 dark:from-purple-950/20 dark:via-transparent dark:to-indigo-950/10 pointer-events-none" />
      
      {/* Nav - becomes sticky after scroll */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800' 
          : 'bg-transparent'
      }`}>
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="text-xl font-semibold tracking-tight">
            <span className="text-purple-600 dark:text-purple-400">Auto</span>mna
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollTo('how-it-works')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Product
            </button>
            <button onClick={() => scrollTo('demo')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Examples
            </button>
            <button onClick={() => scrollTo('integrations')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Integrations
            </button>
            <button onClick={() => scrollTo('pricing')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Pricing
            </button>
            <button onClick={() => scrollTo('security')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Security
            </button>
            <Link href="/docs" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Sign in
            </Link>
            <ThemeToggle />
            {isScrolled && (
              <Link
                href="/sign-up"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-all"
              >
                Request access
              </Link>
            )}
          </div>
          <div className="flex md:hidden items-center gap-3">
            <Link href="/sign-in" className="text-sm text-zinc-500">Sign in</Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Mobile sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href="/sign-up"
          className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-center rounded-lg font-medium transition-all"
        >
          Request access
        </Link>
      </div>

      <main className="relative z-10 pt-20">
        {/* Hero Section */}
        <section id="hero" className="container mx-auto px-6 pt-8 pb-8 md:pt-16 md:pb-20">
          <div className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center transform transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {/* Left column - Copy */}
            <div className="text-left">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium mb-6">
                AI agents for execution
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 leading-[1.1] tracking-tight text-zinc-900 dark:text-white">
                Hand off real work.
                <br />
                <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 dark:from-purple-400 dark:via-violet-400 dark:to-purple-500 bg-clip-text text-transparent">
                  Get back finished deliverables.
                </span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed hidden md:block">
                Automna runs tasks across the web and your tools, then returns outputs you can review and ship—PRs, docs, reports, spreadsheets, and more.
              </p>
              <p className="text-base text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed md:hidden">
                Automna runs tasks and returns finished deliverables you can review and ship.
              </p>

              {/* Optional one-liner */}
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-5 hidden md:block">
                Use it as a hands-off assistant, or run it on schedules and triggers.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-5 md:hidden">
                Use it as a hands-off assistant, or run it on schedules and triggers.
              </p>

              {/* Mobile: show compact terminal mock before bullets */}
              <div className="md:hidden mb-6">
                <TerminalMock tab={demoTabs[0]} compact />
              </div>

              {/* Bullet list - 3 total */}
              <ul className="space-y-2.5 md:space-y-3 mb-6 md:mb-8 text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Deliverables in your tools (not just chat)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Approval gates for sensitive actions</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Run logs + version history for every task</span>
                </li>
              </ul>

              {/* CTA row - hidden on mobile (sticky bar handles it) */}
              <div className="hidden md:flex flex-col sm:flex-row gap-3 items-center mb-4">
                <Link
                  href="/sign-up"
                  className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25 hover:shadow-purple-300 dark:hover:shadow-purple-500/40 text-base whitespace-nowrap text-center"
                >
                  Request access
                </Link>
                <button
                  onClick={() => scrollTo('demo')}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors font-medium"
                >
                  See example runs →
                </button>
              </div>

              {/* Microcopy */}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
                <span>No install</span>
                <span>·</span>
                <span>OAuth connections</span>
                <span>·</span>
                <span>Revoke access anytime</span>
              </div>
            </div>

            {/* Right column - Hero terminal (desktop only) */}
            <div className="hidden md:block">
              <TerminalMock tab={demoTabs[0]} />
            </div>
          </div>
        </section>

        {/* Proof Strip - horizontal scroll on mobile */}
        <section id="proof" className="container mx-auto px-6 py-6 md:py-8 border-y border-zinc-200 dark:border-zinc-800/50">
          <div className="max-w-4xl mx-auto">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3 md:mb-4 text-center">Works where you work</p>
            {/* Mobile: horizontal scroll logos only */}
            <div className="md:hidden overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-5 min-w-max px-2">
                {[...integrations.chat, ...integrations.work, ...integrations.dev, ...integrations.email].map((integration) => (
                  <img key={integration.name} src={integration.icon} alt={integration.name} className="w-6 h-6 object-contain opacity-60" />
                ))}
              </div>
            </div>
            {/* Desktop: logos with labels */}
            <div className="hidden md:flex flex-wrap justify-center items-center gap-6 text-zinc-600 dark:text-zinc-400">
              {[...integrations.chat, ...integrations.work, ...integrations.dev, ...integrations.email].map((integration) => (
                <div key={integration.name} className="flex items-center gap-2">
                  <img src={integration.icon} alt={integration.name} className="w-5 h-5 object-contain opacity-60" />
                  <span className="text-sm">{integration.name}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-3 md:mt-4">
              <button onClick={() => scrollTo('integrations')} className="text-sm text-purple-600 dark:text-purple-400 hover:underline">
                See all integrations →
              </button>
            </div>
          </div>
        </section>

        {/* Demo Section - Tabbed (desktop) / Swipeable cards (mobile) */}
        <section id="demo" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                See what an agent run looks like.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Interactive demo is coming soon. For now, here are real examples of end-to-end runs and outputs.
              </p>
            </div>

            {/* Mobile: horizontal scroll chips */}
            <div className="md:hidden overflow-x-auto scrollbar-hide mb-6">
              <div className="flex gap-2 min-w-max px-1">
                {demoTabs.map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(i);
                      // Scroll card into view
                      if (demoCarouselRef.current) {
                        const card = demoCarouselRef.current.children[i] as HTMLElement;
                        card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      activeTab === i
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    {tab.tabLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile: swipeable card carousel */}
            <div className="md:hidden">
              <div 
                ref={demoCarouselRef}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
                onScroll={(e) => {
                  const container = e.currentTarget;
                  const scrollLeft = container.scrollLeft;
                  const cardWidth = container.offsetWidth * 0.85;
                  const newIndex = Math.round(scrollLeft / cardWidth);
                  if (newIndex !== activeTab && newIndex >= 0 && newIndex < demoTabs.length) {
                    setActiveTab(newIndex);
                  }
                }}
              >
                {demoTabs.map((tab) => (
                  <div key={tab.id} className="snap-center shrink-0 w-[85vw] max-w-sm">
                    <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm pr-2">{tab.title}</h3>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">{tab.oneLiner}</p>

                      {/* Compact steps */}
                      <div className="space-y-2 mb-4">
                        {[
                          { label: 'Trigger', value: tab.trigger },
                          { label: 'Actions', value: tab.actions },
                          { label: 'Output', value: tab.deliverable },
                        ].map((step, j) => (
                          <div key={j} className="flex gap-2">
                            <span className="text-xs font-medium text-purple-600 dark:text-purple-400 shrink-0 w-14">{step.label}</span>
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">{step.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Terminal mock */}
                      <TerminalMock tab={tab} compact />

                      {/* Card CTA */}
                      <div className="mt-4">
                        <Link
                          href={`/sign-up?example=${tab.id}`}
                          className="block w-full py-2.5 text-center rounded-lg text-sm font-medium transition-all bg-purple-600 hover:bg-purple-500 text-white"
                        >
                          {tab.buttonText}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination dots */}
              <div className="flex justify-center gap-2 mt-2">
                {demoTabs.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveTab(i);
                      if (demoCarouselRef.current) {
                        const card = demoCarouselRef.current.children[i] as HTMLElement;
                        card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                      }
                    }}
                    className={`w-2 h-2 rounded-full transition-all ${
                      activeTab === i ? 'bg-purple-600 w-4' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Desktop: original tabbed layout */}
            <div className="hidden md:block">
              {/* Tabs */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {demoTabs.map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === i
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {tab.tabLabel}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="grid md:grid-cols-2 gap-8 items-start">
                {/* Left - steps */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
                      {demoTabs[activeTab].title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {demoTabs[activeTab].oneLiner}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: 'Trigger', value: demoTabs[activeTab].trigger },
                      { label: 'Actions', value: demoTabs[activeTab].actions },
                      { label: 'Deliverable', value: demoTabs[activeTab].deliverable },
                    ].map((step, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-medium shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">{step.label}</div>
                          <div className="text-zinc-800 dark:text-zinc-200">{step.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={`/sign-up?example=${demoTabs[activeTab].id}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-sm"
                  >
                    {demoTabs[activeTab].buttonText}
                  </Link>
                </div>

                {/* Right - terminal mock */}
                <TerminalMock tab={demoTabs[activeTab]} />
              </div>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                How Automna works
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                One place to define work. One place to approve results.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {[
                { num: 1, title: 'Describe the job', desc: 'Write the task in plain English. Add constraints, context, and \'definition of done.\'' },
                { num: 2, title: 'Connect your tools', desc: 'Connect only what you want via OAuth. Use least-privilege scopes.' },
                { num: 3, title: 'Choose autonomy', desc: 'Decide what can run automatically and what must request approval.' },
                { num: 4, title: 'Get deliverables', desc: 'Receive outputs in the right format, with logs you can inspect and reuse.' },
              ].map((step) => (
                <div key={step.num} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold mb-3 md:mb-4">
                    {step.num}
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2 text-sm md:text-base">{step.title}</h3>
                  <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Execution with control.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Agents can browse, write, and run code—only inside the boundaries you set.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {features.map((feature) => (
                <div key={feature.title} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-4 md:p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-1.5 md:mb-2 text-xs md:text-sm">{feature.title}</h3>
                  <p className="text-[11px] md:text-xs text-zinc-600 dark:text-zinc-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Works inside your stack.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Connect the tools you already use. Automna works across web apps and integrations.
              </p>
            </div>

            <div className="space-y-6 md:space-y-8">
              {Object.entries(integrations).map(([category, items]) => (
                <div key={category}>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 md:mb-3 font-medium">
                    {category === 'chat' ? 'Chat' : category === 'work' ? 'Work' : category === 'dev' ? 'Dev' : 'Email'}
                  </div>
                  <div className="flex flex-wrap gap-2 md:gap-3">
                    {items.map((integration) => (
                      <div
                        key={integration.name}
                        className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                      >
                        <img src={integration.icon} alt={integration.name} className="w-5 h-5 md:w-6 md:h-6 object-contain" />
                        <span className="text-xs md:text-sm font-medium text-zinc-700 dark:text-zinc-300">{integration.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-6 justify-center mt-6 md:mt-8 text-sm">
              <a href="mailto:alex@automna.ai" className="text-purple-600 dark:text-purple-400 hover:underline">
                Request an integration
              </a>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section id="comparison" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Chat is where work starts.
                <br />
                <span className="text-purple-600 dark:text-purple-400">Agents are where work finishes.</span>
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Chat helps you think. Agents execute tasks and return shippable outputs.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6">
                <div className="text-zinc-400 dark:text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3 md:mb-4">Chat assistants</div>
                <ul className="space-y-2.5 md:space-y-3">
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Draft, brainstorm, and summarize
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Helpful for decisions and first drafts
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Stops short of end-to-end execution
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-500/10 dark:to-violet-500/5 border-2 border-purple-200 dark:border-purple-500/30 rounded-xl p-5 md:p-6">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wider mb-3 md:mb-4">Agents (Automna)</div>
                <ul className="space-y-2.5 md:space-y-3">
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Execute multi-step work across tools
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Produce deliverables + diffs you can review
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Run with approvals, logs, and repeatability
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Permissions and control by design.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                You decide what an agent can access—and what it&apos;s allowed to do.
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 md:p-8">
              <ul className="space-y-3 md:space-y-4">
                {[
                  { title: 'Connect only the tools you choose (OAuth scopes)', desc: 'Grant access per integration. Each connection uses the minimum permissions needed.' },
                  { title: 'Keep runs read-only until you\'re ready to allow writes', desc: 'Start safe. Agents can read and draft without writing to external tools until you enable it.' },
                  { title: 'Require approval before sends, writes, and merges', desc: 'Sensitive actions queue for your review. Nothing ships without your sign-off.' },
                  { title: 'Inspect run logs and outputs for every task', desc: 'See every action the agent took, step by step. Full transparency on every run.' },
                  { title: 'Revoke access instantly at any time', desc: 'Disconnect tools from your dashboard. Permissions end immediately.' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 md:gap-4">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white text-sm md:text-base">{item.title}</div>
                      <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* What it takes to build this yourself */}
        <section id="build-yourself" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                What it takes to build this yourself
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                If you&apos;re considering DIY agents, here&apos;s what you end up maintaining.
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 md:p-8">
              <ul className="space-y-3 md:space-y-4">
                {[
                  'Secure browser execution environment (isolation, retries, timeouts)',
                  'Permissions model + approvals (least privilege, revocation, auditability)',
                  'Integrations that don\'t constantly break (auth, rate limits, edge cases)',
                  'Run replay + versioning (diffs, artifact history, rollback)',
                  'Reliability layer (scheduling, triggers, queues, concurrency)',
                  'Monitoring and debugging (logs, traces, incident response)',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 md:gap-4">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                      <span className="text-amber-600 dark:text-amber-400 text-xs md:text-sm font-bold">{i + 1}</span>
                    </div>
                    <div className="flex items-center min-h-[1.75rem] md:min-h-[2rem]">
                      <span className="font-medium text-zinc-900 dark:text-white text-sm md:text-base">{item}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm md:text-base mt-6 md:mt-8">
              Automna gives you the execution layer so you can focus on workflows and outcomes.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Simple, transparent pricing
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Start solo. Scale to more agents and team controls as you need them.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
              {/* Starter */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
                <h3 className="text-lg md:text-xl font-semibold text-zinc-900 dark:text-white">Starter</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-3 md:mb-4">For individuals getting started</p>
                <div className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-zinc-900 dark:text-white">
                  $79<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    1 seat
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Core agent runs + web sandbox
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Key integrations
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Approval gates + run logs
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=starter"
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all text-sm"
                >
                  Get started
                </Link>
              </div>

              {/* Pro */}
              <div className="bg-gradient-to-b from-purple-50 to-violet-50 dark:from-purple-500/15 dark:to-violet-500/5 border-2 border-purple-300 dark:border-purple-500/40 rounded-xl p-5 md:p-6 shadow-xl shadow-purple-100 dark:shadow-purple-500/10 md:scale-[1.02]">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-semibold mb-2 uppercase tracking-wide">Most Popular</div>
                <h3 className="text-lg md:text-xl font-semibold text-zinc-900 dark:text-white">Pro</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-3 md:mb-4">For power users</p>
                <div className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-zinc-900 dark:text-white">
                  $149<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Everything in Starter
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Up to 4 agents
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    More integrations and higher usage limits
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Scheduling + triggers
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    API access
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=pro"
                  className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-center transition-all text-sm"
                >
                  Start Pro
                </Link>
              </div>

              {/* Business */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
                <h3 className="text-lg md:text-xl font-semibold text-zinc-900 dark:text-white">Business</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-3 md:mb-4">For teams</p>
                <div className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-zinc-900 dark:text-white">
                  $299<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Everything in Pro
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Team &amp; shared workspaces
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Admin controls
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Audit logs
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Priority support
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=business"
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all text-sm"
                >
                  Start Business
                </Link>
              </div>
            </div>

            <p className="text-center text-zinc-500 dark:text-zinc-400 text-xs md:text-sm mt-5 md:mt-6">
              Monthly billing. Cancel anytime.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-2 md:space-y-3">
              {faqItems.map((faq, i) => (
                <div key={i} className="border border-zinc-200 dark:border-zinc-800/50 rounded-xl overflow-hidden bg-white dark:bg-zinc-900/50">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full px-5 md:px-6 py-3.5 md:py-4 text-left flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-white pr-4">{faq.q}</span>
                    <svg 
                      className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ${expandedFaq === i ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedFaq === i && (
                    <div className="px-5 md:px-6 pb-3.5 md:pb-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="final-cta" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-4 text-zinc-900 dark:text-white">
              Ready to hand off a task?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg mb-6 md:mb-8">
              Tell Automna what &ldquo;done&rdquo; looks like. Get back work you can ship.
            </p>

            <div className="hidden md:flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25"
              >
                Request access
              </Link>
              <button
                onClick={() => scrollTo('demo')}
                className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors font-medium"
              >
                See example runs →
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 dark:border-zinc-800/50 py-8 md:py-12 bg-white dark:bg-zinc-950 pb-24 md:pb-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 md:gap-8">
            <div>
              <div className="text-xl font-semibold tracking-tight mb-2 md:mb-4">
                <span className="text-purple-600 dark:text-purple-400">Auto</span>mna
              </div>
              <p className="text-zinc-400 dark:text-zinc-600 text-sm">© 2026 Automna · Powered by <a href="https://openclaw.ai" target="_blank" rel="noopener noreferrer" className="text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors">OpenClaw</a></p>
            </div>
            <div className="flex flex-wrap gap-x-6 md:gap-x-8 gap-y-3 md:gap-y-4 text-zinc-500 dark:text-zinc-500 text-sm">
              <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Terms</Link>
              <button onClick={() => scrollTo('security')} className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Security</button>
              <a href="mailto:alex@automna.ai" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Utility CSS for hiding scrollbars */}
      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
