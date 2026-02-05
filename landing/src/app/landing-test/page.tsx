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
    id: 'competitor',
    title: 'Competitor monitor',
    oneLiner: 'Track mentions and ship a clean summary to your inbox or Slack.',
    trigger: 'Check Hacker News and selected sources every hour.',
    actions: 'Detect high-signal posts → read comments → summarize sentiment.',
    deliverable: 'Draft email + Slack message, ready for approval.',
    buttonText: 'Use Competitor Monitor template',
  },
  {
    id: 'daily-brief',
    title: 'Daily ops brief',
    oneLiner: 'Send a daily digest that your team actually reads.',
    trigger: 'Every weekday at 7:30am.',
    actions: 'Pull updates from docs, tickets, and dashboards.',
    deliverable: 'A structured brief posted to Slack + saved to Notion.',
    buttonText: 'Use Daily Brief template',
  },
  {
    id: 'support',
    title: 'Support triage',
    oneLiner: 'Turn a messy inbox into prioritized next actions.',
    trigger: 'New tickets arrive.',
    actions: 'Categorize → draft replies → flag urgent issues.',
    deliverable: 'Queue updated + drafts ready for review.',
    buttonText: 'Use Support Triage template',
  },
  {
    id: 'engineering',
    title: 'Engineering helper',
    oneLiner: 'Keep code, docs, and PRs moving.',
    trigger: 'New issue or PR opened.',
    actions: 'Summarize context → propose changes → update docs.',
    deliverable: 'PR comment + draft patch (approval before pushing).',
    buttonText: 'Use Engineering Helper template',
  },
];

// Templates data
const templates = [
  { title: 'Competitor Monitor', description: 'Monitors sources and summarizes what matters.', output: 'Email + Slack brief' },
  { title: 'Daily Ops Brief', description: 'Daily digest across your tools.', output: 'Slack post + Notion page' },
  { title: 'Lead List Builder', description: 'Find and compile prospects with notes.', output: 'Spreadsheet + outreach draft' },
  { title: 'Support Triage', description: 'Prioritize tickets and draft responses.', output: 'Queue updates + reply drafts' },
  { title: 'Content Research Pack', description: 'Research a topic and produce a structured outline.', output: 'Doc with sources + outline' },
  { title: 'Meeting Follow-ups', description: 'Turn notes into tasks and follow-up emails.', output: 'Trello/Notion tasks + email recap' },
];

// Features data
const features = [
  { title: 'Web actions that finish', description: 'Log in, navigate, fill forms, extract data, monitor pages.' },
  { title: 'Email + messaging outputs', description: 'Draft, summarize, and send updates where your team already is.' },
  { title: 'Real deliverables', description: 'Creates docs, notes, lists, and reports—not just chat replies.' },
  { title: 'Approval gates', description: 'Require review for sends, edits, and sensitive actions.' },
  { title: 'Schedules + triggers', description: 'Hourly checks, daily briefs, event-based workflows.' },
  { title: 'Persistent memory', description: 'Remembers preferences, formats, and project context.' },
  { title: 'API-ready', description: 'Connect internal systems with REST/GraphQL when needed.' },
  { title: 'Runs 24/7', description: 'Cloud runtime designed for ongoing work.' },
];

// FAQ data
const faqItems = [
  { q: 'Do I need my own API key?', a: 'No. Automna is fully hosted—no API setup required.' },
  { q: "What's the difference between an agent and a chat assistant?", a: 'Chat helps you think. Agents run workflows: they can take tool actions, run on schedules, and deliver finished outputs.' },
  { q: 'Can I control what it does autonomously?', a: 'Yes. Choose read-only, approval-first, or autopilot modes depending on the task.' },
  { q: 'What happens if it gets something wrong?', a: 'Use approval-first mode for important actions. You can refine instructions and rerun tasks.' },
  { q: 'Is my data private?', a: 'Automna only accesses what you connect. You can revoke access at any time.' },
  { q: 'What can it automate?', a: 'Monitoring, research, summaries, drafting, updates across docs/tickets/repos, and scheduled reporting—depending on connected tools.' },
  { q: 'Can my team share an agent?', a: 'On Business plans, agents can live in a team workspace.' },
];

export default function LandingTest() {
  const [isVisible, setIsVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);

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
              How it works
            </button>
            <button onClick={() => scrollTo('templates')} className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Templates
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
            <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Sign in
            </Link>
            <ThemeToggle />
            {isScrolled && (
              <Link
                href="/sign-up"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-all"
              >
                Create your first agent
              </Link>
            )}
          </div>
          <div className="flex md:hidden items-center gap-3">
            <Link href="/sign-in" className="text-sm text-zinc-500">Sign in</Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Mobile sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 p-4">
        <Link
          href="/sign-up"
          className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-center rounded-lg font-medium transition-all"
        >
          Create your first agent
        </Link>
      </div>

      <main className="relative z-10 pt-20">
        {/* Hero Section - 2 column */}
        <section id="hero" className="container mx-auto px-6 pt-8 pb-12 md:pt-16 md:pb-20">
          <div className={`grid md:grid-cols-2 gap-12 items-center transform transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {/* Left column - Copy */}
            <div className="text-left">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium mb-6">
                AI agents that execute
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1] tracking-tight text-zinc-900 dark:text-white">
                Delegate real work.
                <br />
                <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 dark:from-purple-400 dark:via-violet-400 dark:to-purple-500 bg-clip-text text-transparent">
                  Get finished deliverables back.
                </span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                Automna runs tasks across the web and your tools—then delivers results to the places you already work. Use approval-only mode, or let it run on autopilot.
              </p>

              {/* Bullet list */}
              <ul className="space-y-3 mb-8 text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-1">✓</span>
                  <span>Runs 24/7 in the cloud (scheduled or triggered)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-1">✓</span>
                  <span>Works across your stack: web, email, docs, tickets, repos</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-1">✓</span>
                  <span>Approval gates for sensitive actions</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-1">✓</span>
                  <span>Persistent memory for your projects and preferences</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-1">✓</span>
                  <span>Saves outputs as real artifacts (emails, docs, notes, updates)</span>
                </li>
              </ul>

              {/* CTA row */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Link
                  href="/sign-up"
                  className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25 hover:shadow-purple-300 dark:hover:shadow-purple-500/40 text-base whitespace-nowrap text-center"
                >
                  Create your first agent
                </Link>
                <button
                  onClick={() => setDemoModalOpen(true)}
                  className="px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-all text-base whitespace-nowrap text-center flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Watch demo
                </button>
              </div>

              {/* Microcopy */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                <span>No API key required.</span>
                <span className="hidden sm:block">•</span>
                <span>Cancel anytime.</span>
                <span className="hidden sm:block">•</span>
                <button onClick={() => scrollTo('security')} className="hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2">
                  Privacy & security
                </button>
              </div>
            </div>

            {/* Right column - Hero media placeholder */}
            <div className="hidden md:block">
              <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800 p-6 shadow-2xl">
                {/* Terminal header */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                    </div>
                    <span className="text-zinc-500 text-sm">automna agent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-emerald-400/80 text-xs font-medium">running</span>
                  </div>
                </div>
                
                {/* Demo content - static representation */}
                <div className="space-y-4 font-mono text-sm">
                  <div className="flex gap-3">
                    <span className="text-purple-400 shrink-0">template:</span>
                    <span className="text-zinc-300">Competitor Monitor</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-emerald-400 shrink-0">agent:</span>
                    <span className="text-zinc-400">Found trending post on HN...</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-emerald-400 shrink-0">agent:</span>
                    <span className="text-zinc-400">Analyzing 89 comments...</span>
                  </div>
                  <div className="my-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Draft Email Ready</div>
                    <div className="text-zinc-300 text-sm">Subject: Competitor Alert - Acme Corp raises $50M...</div>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors">
                      Approve & send
                    </button>
                    <button className="px-4 py-2 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:border-zinc-600 transition-colors">
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Proof Strip */}
        <section id="proof" className="container mx-auto px-6 py-8 border-y border-zinc-200 dark:border-zinc-800/50">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Works where you work</p>
              <div className="flex flex-wrap justify-center items-center gap-6 text-zinc-600 dark:text-zinc-400">
                {[...integrations.chat, ...integrations.work, ...integrations.dev, ...integrations.email].map((integration) => (
                  <div key={integration.name} className="flex items-center gap-2">
                    <img src={integration.icon} alt={integration.name} className="w-5 h-5 object-contain opacity-60" />
                    <span className="text-sm">{integration.name}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => scrollTo('integrations')} className="mt-4 text-sm text-purple-600 dark:text-purple-400 hover:underline">
                See all integrations →
              </button>
            </div>
          </div>
        </section>

        {/* Demo Section - Tabbed */}
        <section id="demo" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                See an agent finish a task.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Not suggestions—actions, approvals, and a final deliverable.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {demoTabs.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(i)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === i
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {tab.title}
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
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-medium shrink-0">
                      1
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Trigger</div>
                      <div className="text-zinc-800 dark:text-zinc-200">{demoTabs[activeTab].trigger}</div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-medium shrink-0">
                      2
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Actions</div>
                      <div className="text-zinc-800 dark:text-zinc-200">{demoTabs[activeTab].actions}</div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-medium shrink-0">
                      3
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Deliverable</div>
                      <div className="text-zinc-800 dark:text-zinc-200">{demoTabs[activeTab].deliverable}</div>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/sign-up?template=${demoTabs[activeTab].id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-sm"
                >
                  {demoTabs[activeTab].buttonText}
                </Link>
              </div>

              {/* Right - media placeholder */}
              <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-xl border border-zinc-800 p-6">
                <div className="aspect-[4/3] flex items-center justify-center text-zinc-600">
                  <div className="text-center">
                    <div className="text-4xl mb-3">🎬</div>
                    <p className="text-sm">Demo video placeholder</p>
                    <p className="text-xs text-zinc-700 mt-1">(Replace with actual demo)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-center"
              >
                Create your first agent
              </Link>
              <button
                onClick={() => setDemoModalOpen(true)}
                className="px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Watch demo
              </button>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                How Automna works
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Set the job once. Get outputs continuously.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { num: 1, title: 'Pick a template (or describe the job)', desc: 'Start from proven workflows or write a simple instruction.' },
                { num: 2, title: 'Connect your tools', desc: 'Grant only the access you want the agent to have.' },
                { num: 3, title: 'Choose autonomy', desc: 'Read-only, approval-first, or autopilot for safe tasks.' },
                { num: 4, title: 'Get deliverables', desc: 'Results arrive as emails, docs, updates, and messages—ready to use.' },
              ].map((step) => (
                <div key={step.num} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold mb-4">
                    {step.num}
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-center"
              >
                Create your first agent
              </Link>
              <button
                onClick={() => setDemoModalOpen(true)}
                className="px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Watch demo
              </button>
            </div>
          </div>
        </section>

        {/* Templates Gallery */}
        <section id="templates" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Start from templates
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Launch a working agent in minutes—then customize.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.title} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 hover:border-purple-300 dark:hover:border-purple-500/50 hover:shadow-md transition-all group">
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{template.title}</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">{template.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">Output: {template.output}</span>
                    <Link href={`/sign-up?template=${template.title.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Use →
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-center"
              >
                Create your first agent
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Execution with control.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Agents can browse, write, and take actions—while you decide what requires approval.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {features.map((feature) => (
                <div key={feature.title} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                  <h3 className="font-semibold text-zinc-900 dark:text-white mb-2 text-sm">{feature.title}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Works inside your stack.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Connect tools once. Deliver outputs where they belong.
              </p>
            </div>

            <div className="space-y-8">
              {Object.entries(integrations).map(([category, items]) => (
                <div key={category}>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3 font-medium">
                    {category === 'chat' ? 'Chat' : category === 'work' ? 'Work' : category === 'dev' ? 'Dev' : 'Email'}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {items.map((integration) => (
                      <div
                        key={integration.name}
                        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                      >
                        <img src={integration.icon} alt={integration.name} className="w-6 h-6 object-contain" />
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{integration.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-6 justify-center mt-8 text-sm">
              <a href="mailto:hello@automna.ai" className="text-purple-600 dark:text-purple-400 hover:underline">
                Request an integration
              </a>
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-center"
              >
                Create your first agent
              </Link>
              <button
                onClick={() => setDemoModalOpen(true)}
                className="px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Watch demo
              </button>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section id="comparison" className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Chat is where work starts.
                <br />
                <span className="text-purple-600 dark:text-purple-400">Agents are where work finishes.</span>
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Automna is built to run workflows—on a schedule, across tools, with control.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6">
                <div className="text-zinc-400 dark:text-zinc-500 text-xs font-medium uppercase tracking-wider mb-4">Chat assistants</div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Answer questions and draft content
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    You still run the workflow
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    No persistent execution loop
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Outputs often live in the chat window
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-500/10 dark:to-violet-500/5 border-2 border-purple-200 dark:border-purple-500/30 rounded-xl p-6">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wider mb-4">Automna agents</div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Execute multi-step tasks
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Run scheduled or event-driven
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Use web + connected tools
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Deliver artifacts to your workspace
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    Approval-first or autopilot modes
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Permissions and control by design.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                You decide what the agent can access—and what it&apos;s allowed to do.
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-8">
              <ul className="space-y-4">
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-white">Connect only the tools you want (scoped access)</div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Grant permissions per integration. Revoke anytime.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-white">Approval-only mode for sensitive actions</div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Review before sending, publishing, or modifying data.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-white">Review outputs before sending or publishing</div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Drafts queue for your approval. You have final say.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-white">Revoke access at any time</div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Disconnect tools instantly from your dashboard.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Simple, transparent pricing
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                Start small. Scale when ready.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {/* Starter */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Starter</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4">For getting started</p>
                <div className="text-4xl font-bold mb-6 text-zinc-900 dark:text-white">
                  $79<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    1 agent
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Web chat interface
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Basic memory (30 days)
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Email support
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=starter"
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all"
                >
                  Start Starter
                </Link>
              </div>

              {/* Pro */}
              <div className="bg-gradient-to-b from-purple-50 to-violet-50 dark:from-purple-500/15 dark:to-violet-500/5 border-2 border-purple-300 dark:border-purple-500/40 rounded-xl p-6 shadow-xl shadow-purple-100 dark:shadow-purple-500/10 scale-[1.02]">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-semibold mb-2 uppercase tracking-wide">Most Popular</div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Pro</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4">For operators and power users</p>
                <div className="text-4xl font-bold mb-6 text-zinc-900 dark:text-white">
                  $149<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    1 agent
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    All integrations
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Cloud browser access
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Agent email inbox
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Unlimited memory
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=pro"
                  className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-center transition-all"
                >
                  Start Pro
                </Link>
              </div>

              {/* Business */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Business</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4">For teams and agencies</p>
                <div className="text-4xl font-bold mb-6 text-zinc-900 dark:text-white">
                  $299<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    3 agents
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Everything in Pro
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Team workspace
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    API access
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Dedicated support
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=business"
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all"
                >
                  Start Business
                </Link>
              </div>
            </div>

            <p className="text-center text-zinc-500 dark:text-zinc-400 text-sm mt-6">
              No API key required.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqItems.map((faq, i) => (
                <div key={i} className="border border-zinc-200 dark:border-zinc-800/50 rounded-xl overflow-hidden bg-white dark:bg-zinc-900/50">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">{faq.q}</span>
                    <svg 
                      className={`w-4 h-4 text-zinc-400 transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedFaq === i && (
                    <div className="px-6 pb-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="final-cta" className="container mx-auto px-6 py-16 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-zinc-900 dark:text-white">
              Ready to delegate?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-lg mb-8">
              Create an agent in minutes. Keep control with approvals.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25"
              >
                Create your first agent
              </Link>
              <button
                onClick={() => setDemoModalOpen(true)}
                className="px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Watch demo
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-200 dark:border-zinc-800/50 py-12 bg-white dark:bg-zinc-950 pb-24 md:pb-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="text-xl font-semibold tracking-tight mb-4">
                <span className="text-purple-600 dark:text-purple-400">Auto</span>mna
              </div>
              <p className="text-zinc-400 dark:text-zinc-600 text-sm">© 2026 Automna</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-zinc-500 dark:text-zinc-500 text-sm">
              <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Terms</Link>
              <button onClick={() => scrollTo('security')} className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Security</button>
              <a href="mailto:hello@automna.ai" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Demo Modal */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDemoModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <button
              onClick={() => setDemoModalOpen(false)}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="aspect-video bg-zinc-900 flex items-center justify-center">
              <div className="text-center text-zinc-500">
                <div className="text-5xl mb-4">🎬</div>
                <p>Demo video placeholder</p>
                <p className="text-sm text-zinc-600 mt-1">(90s product demo goes here)</p>
              </div>
            </div>
            <div className="p-6 text-center">
              <Link
                href="/sign-up"
                className="inline-block px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all"
              >
                Create your first agent
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
