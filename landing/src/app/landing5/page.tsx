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
    tabLabel: 'Ship Features',
    title: 'Ship a feature from plain English',
    oneLiner: 'Describe the feature in plain English. Get a PR you can review and merge.',
    trigger: 'Paste a feature request (or link an issue).',
    actions: 'Read repo → plan → implement → update tests/docs → prepare PR.',
    deliverable: 'PR draft + test notes, ready for approval.',
    buttonText: 'Try this example',
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
    id: 'phone-agent',
    tabLabel: 'Phone Calls',
    title: 'AI phone agent',
    oneLiner: 'Answer, qualify, and follow up—while you approve what gets sent.',
    trigger: 'Inbound call or outbound call list.',
    actions: 'Qualify → capture notes → summarize → draft follow-up → create next steps.',
    deliverable: 'Call summary + follow-up email draft, ready for approval.',
    buttonText: 'Try this example',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Handle inbound calls',
    logLines: [
      'agent: Incoming call…',
      'agent: Asking qualification questions…',
      'agent: Capturing requirements and next steps…',
      'agent: Drafting follow-up email…',
    ],
    deliverableCard: {
      label: 'CALL SUMMARY READY',
      title: 'Qualified lead · Next step: schedule demo',
      bullets: [
        'Summary: caller wants pricing + timeline',
        'Next steps: propose 3 time slots',
        'Follow-up email draft ready',
      ],
      primaryBtn: 'Approve & send follow-up',
      secondaryBtn: 'See details',
      footer: 'Inbound & outbound calls · Pro & Business plans.',
    },
  },
  {
    id: 'influencer-research',
    tabLabel: 'Influencer Outreach',
    title: 'Find 100 high-fit influencers (parallel research)',
    oneLiner: 'Spin up parallel research workers and deliver a ranked list with notes and contact links.',
    trigger: 'Run once (or weekly) with your product + audience.',
    actions: 'Parallel research → score fit → dedupe → compile notes + sources.',
    deliverable: 'Ranked list (CSV/Notion) + outreach drafts, ready to use.',
    buttonText: 'Try this example',
    buttonAction: 'prefill',
    comingSoon: false,
    statusBadge: 'running',
    headerLine: 'task: Find 100 fashion influencers (parallel)',
    logLines: [
      'agent: Launching 8 parallel research workers…',
      'agent: Worker 2: collecting TikTok candidates…',
      'agent: Worker 6: collecting Instagram candidates…',
      'agent: Deduplicating and scoring…',
      'agent: List ready (100 entries).',
    ],
    deliverableCard: {
      label: 'DATABASE READY',
      title: 'Influencers · 100 found · ranked by fit',
      bullets: [
        'Fields: handle, platform, followers, fit score, contact path',
        'Sources included for each entry',
        'Outreach drafts included (email + DM)',
      ],
      primaryBtn: 'Download CSV',
      secondaryBtn: 'Open in Notion',
      footer: 'Approval required before sending outreach.',
    },
  },
  {
    id: 'inbox-to-done',
    tabLabel: 'Email → Done',
    title: 'Never drop a follow-up',
    oneLiner: 'Turn email threads into drafted replies and a prioritized task list—automatically.',
    trigger: 'Monitor a label/folder like "Follow Up" or "Important".',
    actions: 'Summarize → extract action items → draft replies → create tasks.',
    deliverable: 'Reply drafts + task list + digest, ready for approval.',
    buttonText: 'Try this example',
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
  { title: 'Web actions that finish', description: 'Log in, navigate, fill forms, extract data, monitor pages. With approvals when needed.' },
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
  { q: 'Can I control what it does autonomously?', a: 'Yes. You can explain how autonomous you want your agent to be, and the bot will do its best to follow your guidelines.' },
  { q: 'What happens if it gets something wrong?', a: "Agents aren't perfect—they can make mistakes. In most cases agents are self-correcting or correcting with minimal guidance. But it's important not to give your agent access to information that's more sensitive than you would give to an intern." },
  { q: 'Is my data private?', a: 'Automna only accesses what you connect. You can revoke access at any time.' },
  { q: 'What can it automate?', a: 'Monitoring, research, summaries, drafting, updates across docs/tasks/repos, and scheduled reporting—depending on connected tools.' },
  { q: 'Can my team share an agent?', a: 'You can add agents to Slack channels, Discord servers, and Telegram groups—so they can collaborate with your team and even talk to each other.' },
];

// Animated Hero Chat component
function HeroChat() {
  const [step, setStep] = useState(-1); // -1 = not started
  const [typedUser, setTypedUser] = useState('');
  const [typedAgent, setTypedAgent] = useState('');
  const [showTypingDots, setShowTypingDots] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState<number[]>([]);
  const [showDeliverable, setShowDeliverable] = useState(false);
  const [cycle, setCycle] = useState(0);

  const userMessage = "Research the top sushi restaurants in town, email the list to me and my friends who RSVP'd to dinner tonight, then call around to see who has a table for 6";

  const agentMessages = [
    "Searching for top-rated sushi restaurants nearby...",
    "Found 8 restaurants. Comparing reviews and availability...",
    "Pulling your dinner RSVP list from calendar — 4 friends confirmed.",
    "Emailing top 5 picks to you, Sarah, Mike, Jen, and David...",
    "Emails sent ✓ Now calling restaurants for tonight...",
    "Called 5 restaurants — 3 have tables for 6.",
  ];

  // Reset and replay loop
  useEffect(() => {
    const startDelay = setTimeout(() => setStep(0), 800);
    return () => clearTimeout(startDelay);
  }, [cycle]);

  // Step machine
  useEffect(() => {
    if (step < 0) return;

    // Step 0: Type user message
    if (step === 0) {
      setTypedUser('');
      setVisibleMessages([]);
      setShowDeliverable(false);
      setShowTypingDots(false);
      setTypedAgent('');
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setTypedUser(userMessage.slice(0, i));
        if (i >= userMessage.length) {
          clearInterval(interval);
          setTimeout(() => setStep(1), 600);
        }
      }, 18);
      return () => clearInterval(interval);
    }

    // Steps 1-6: Agent messages (typing dots → typewriter)
    if (step >= 1 && step <= agentMessages.length) {
      const msgIndex = step - 1;
      setShowTypingDots(true);
      setTypedAgent('');

      const dotsDelay = setTimeout(() => {
        setShowTypingDots(false);
        let i = 0;
        const text = agentMessages[msgIndex];
        const interval = setInterval(() => {
          i++;
          setTypedAgent(text.slice(0, i));
          if (i >= text.length) {
            clearInterval(interval);
            setVisibleMessages(prev => [...prev, msgIndex]);
            setTypedAgent('');
            setTimeout(() => setStep(step + 1), 400);
          }
        }, 22);
        return () => clearInterval(interval);
      }, 800 + Math.random() * 400);

      return () => clearTimeout(dotsDelay);
    }

    // Step 7: Show deliverable card
    if (step === agentMessages.length + 1) {
      setShowTypingDots(true);
      const timer = setTimeout(() => {
        setShowTypingDots(false);
        setShowDeliverable(true);
        // Restart after pause
        setTimeout(() => {
          setStep(-1);
          setTypedUser('');
          setVisibleMessages([]);
          setShowDeliverable(false);
          setShowTypingDots(false);
          setCycle(c => c + 1);
        }, 6000);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const Avatar = () => (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
      <span className="text-white text-[10px] font-bold">A</span>
    </div>
  );

  const TypingDots = () => (
    <div className="flex items-start gap-2">
      <Avatar />
      <div className="px-4 py-2.5 bg-white dark:bg-zinc-800 rounded-2xl rounded-tl-md border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-1 h-5">
          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 md:p-5 shadow-lg">
      {/* Chat header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-200 dark:border-zinc-700/50">
        <div className="flex items-center gap-2">
          <Avatar />
          <div>
            <span className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">Automna</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="space-y-3 min-h-[320px] max-h-[420px] overflow-hidden">
        {/* User message - types in */}
        {typedUser && (
          <div className="flex justify-end animate-fadeIn">
            <div className="max-w-[85%] px-4 py-2.5 bg-purple-600 text-white rounded-2xl rounded-br-md shadow-sm">
              <span className="text-sm">{typedUser}{step === 0 && <span className="animate-pulse">|</span>}</span>
            </div>
          </div>
        )}

        {/* Completed agent messages */}
        {visibleMessages.map((msgIdx, i) => (
          <div key={msgIdx} className="flex items-start gap-2 animate-fadeIn">
            {i === 0 && <Avatar />}
            {i !== 0 && <div className="w-7 shrink-0" />}
            <div className="px-4 py-2.5 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
              <span className="text-zinc-700 dark:text-zinc-300 text-sm">{agentMessages[msgIdx]}</span>
            </div>
          </div>
        ))}

        {/* Currently typing agent message */}
        {typedAgent && !showTypingDots && (
          <div className="flex items-start gap-2">
            {visibleMessages.length === 0 && <Avatar />}
            {visibleMessages.length > 0 && <div className="w-7 shrink-0" />}
            <div className="px-4 py-2.5 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
              <span className="text-zinc-700 dark:text-zinc-300 text-sm">{typedAgent}<span className="animate-pulse text-purple-500">|</span></span>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {showTypingDots && <TypingDots />}

        {/* Deliverable card */}
        {showDeliverable && (
          <div className="flex items-start gap-2 animate-fadeIn">
            <div className="w-7 shrink-0" />
            <div className="p-4 bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm max-w-[90%]">
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">RESERVATIONS FOUND</div>
              <div className="text-zinc-800 dark:text-zinc-200 text-sm font-medium mb-1.5">3 tables available tonight for 6</div>
              <div className="space-y-0.5 mb-2.5">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">• Omakase House — 7:30 PM, bar seating</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">• Sushi Zen — 8:00 PM, private booth</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">• Kiyomi — 8:30 PM, patio table</div>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-600 text-white text-xs rounded-lg font-medium">Book Sushi Zen</div>
                <div className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 text-xs rounded-lg">See all options</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Animated counter hook
function useAnimatedCounter(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!hasStarted) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [hasStarted, target, duration]);

  return { count, start: () => setHasStarted(true) };
}

// Sample activity feed lines (would be real data in production)
const activityFeed = [
  { agent: 'Agent', action: 'processed 47 emails, drafted 4 replies' },
  { agent: 'Agent', action: 'researched 12 leads, compiled outreach list' },
  { agent: 'Agent', action: 'summarized 8 Slack threads into digest' },
  { agent: 'Agent', action: 'updated CRM with 23 new contacts' },
  { agent: 'Agent', action: 'drafted weekly report from project notes' },
  { agent: 'Agent', action: 'monitored 5 competitors, flagged 2 changes' },
  { agent: 'Agent', action: 'triaged 31 support tickets by priority' },
  { agent: 'Agent', action: 'scheduled 6 follow-ups from meeting notes' },
];

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const demoCarouselRef = useRef<HTMLDivElement>(null);
  const [activityIndex, setActivityIndex] = useState(0);

  // Live counters (mocked - would fetch from API in production)
  const tasksToday = useAnimatedCounter(2847, 2500);
  const agentsWorking = useAnimatedCounter(38, 1800);

  useEffect(() => {
    setIsVisible(true);
    // Start counters after a short delay
    const counterTimer = setTimeout(() => {
      tasksToday.start();
      agentsWorking.start();
    }, 500);
    
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    
    window.addEventListener('scroll', handleScroll);

    // Rotate activity feed
    const feedTimer = setInterval(() => {
      setActivityIndex(prev => (prev + 1) % activityFeed.length);
    }, 4000);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(counterTimer);
      clearInterval(feedTimer);
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Chat-style mock component (reused in hero and demo)
  const TerminalMock = ({ tab, compact = false }: { tab: typeof demoTabs[0], compact?: boolean }) => {
    // Assistant avatar
    const Avatar = () => (
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <span className="text-white text-[10px] md:text-xs font-bold">A</span>
      </div>
    );

    const logLines = compact ? tab.logLines.slice(-2) : tab.logLines.slice(-3);

    return (
      <div className={`bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800 ${compact ? 'p-3' : 'p-4 md:p-5'} shadow-lg`}>
        {/* Chat header */}
        <div className={`flex items-center justify-between ${compact ? 'mb-3 pb-2' : 'mb-4 pb-3'} border-b border-zinc-200 dark:border-zinc-700/50`}>
          <div className="flex items-center gap-2">
            <Avatar />
            <div>
              <span className="text-zinc-800 dark:text-zinc-200 text-xs md:text-sm font-medium">Automna</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat messages */}
        <div className={`space-y-3 ${compact ? '' : 'md:space-y-4'}`}>
          {/* User message - task instruction */}
          <div className="flex justify-end">
            <div className={`${compact ? 'max-w-[85%] px-3 py-2' : 'max-w-[80%] px-4 py-2.5'} bg-purple-600 text-white rounded-2xl rounded-br-md shadow-sm`}>
              <span className="text-xs md:text-sm">{tab.headerLine.replace('task: ', '')}</span>
            </div>
          </div>

          {/* Assistant progress messages */}
          {logLines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              {i === 0 && <Avatar />}
              {i !== 0 && <div className="w-7 md:w-8 shrink-0" />}
              <div className={`${compact ? 'px-3 py-2' : 'px-4 py-2.5'} bg-white dark:bg-zinc-800 rounded-2xl ${i === 0 ? 'rounded-tl-md' : ''} border border-zinc-200 dark:border-zinc-700 shadow-sm`}>
                <span className="text-zinc-700 dark:text-zinc-300 text-xs md:text-sm">{line.replace('agent: ', '')}</span>
              </div>
            </div>
          ))}

          {/* Deliverable card as a special message */}
          <div className="flex items-start gap-2">
            <div className="w-7 md:w-8 shrink-0" />
            <div className={`${compact ? 'p-3' : 'p-3 md:p-4'} bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-sm max-w-[90%]`}>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{tab.deliverableCard.label}</div>
              <div className="text-zinc-800 dark:text-zinc-200 text-xs md:text-sm font-medium mb-1.5">{tab.deliverableCard.title}</div>
              <div className="space-y-0.5 mb-2.5">
                {(compact ? tab.deliverableCard.bullets.slice(0, 2) : tab.deliverableCard.bullets).map((bullet, i) => (
                  <div key={i} className="text-[11px] md:text-xs text-zinc-500 dark:text-zinc-400">• {bullet}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-600 text-white text-[11px] md:text-xs rounded-lg font-medium">
                  {tab.deliverableCard.primaryBtn}
                </div>
                <div className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 text-[11px] md:text-xs rounded-lg">
                  {tab.deliverableCard.secondaryBtn}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
            <Link href="/sign-in" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
              Sign in
            </Link>
            <ThemeToggle />
            {isScrolled && (
              <Link
                href="/sign-up"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-all"
              >
                Get Work Done
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
          Get Work Done
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
                AI agents that execute
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 leading-[1.1] tracking-tight text-zinc-900 dark:text-white">
                Give Automna instructions.
                <br />
                <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 dark:from-purple-400 dark:via-violet-400 dark:to-purple-500 bg-clip-text text-transparent">
                  Get back finished work.
                </span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed hidden md:block">
                Automna runs tasks across the web and throughout your tools, then delivers results to the places you already work.
              </p>
              <p className="text-base text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed md:hidden">
                Automna runs tasks across the web and your tools, then delivers results where you already work.
              </p>

              {/* Mobile: show compact terminal mock before bullets */}
              <div className="md:hidden mb-6">
                <TerminalMock tab={demoTabs[0]} compact />
              </div>

              {/* Bullet list - 3 on mobile, 5 on desktop */}
              <ul className="space-y-2.5 md:space-y-3 mb-6 md:mb-8 text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Automna has a dedicated email and phone number. Just like a human assistant.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Runs 24/7 in the cloud, so you can get work done while you sleep.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                  <span>Integrations mean you can work with Automna in all your existing apps.</span>
                </li>
              </ul>

              {/* CTA row - hidden on mobile (sticky bar handles it) */}
              <div className="hidden md:flex flex-col sm:flex-row gap-3 mb-4">
                <Link
                  href="/sign-up"
                  className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25 hover:shadow-purple-300 dark:hover:shadow-purple-500/40 text-base whitespace-nowrap text-center"
                >
                  Get Work Done
                </Link>
              </div>

              {/* Microcopy */}
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
                <span>No API key required</span>
                <span>•</span>
                <span>Takes ~60 seconds to start</span>
                <span>•</span>
                <button onClick={() => scrollTo('security')} className="hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2">
                  Privacy & security
                </button>
              </div>
            </div>

            {/* Right column - Animated hero chat (desktop only) */}
            <div className="hidden md:block">
              <HeroChat />
            </div>
          </div>
        </section>

        {/* Live Stats Bar */}
        <section className="container mx-auto px-6 py-4 md:py-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row items-center gap-3 md:gap-0 md:justify-between bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 md:px-6 py-3 md:py-4">
              {/* Activity ticker */}
              <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Live</span>
                </div>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 shrink-0 hidden md:block"></div>
                <div className="overflow-hidden min-w-0 flex-1">
                  <div key={activityIndex} className="flex items-center gap-2 animate-fadeIn">
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 shrink-0">Agent</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{activityFeed[activityIndex].action}</span>
                  </div>
                </div>
              </div>

              {/* Stats counters */}
              <div className="flex items-center gap-4 md:gap-6 shrink-0">
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 hidden md:block"></div>
                <div className="flex items-center gap-2">
                  <span className="text-lg md:text-xl font-bold text-zinc-800 dark:text-white tabular-nums">{tasksToday.count.toLocaleString()}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">tasks today</span>
                </div>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700"></div>
                <div className="flex items-center gap-2">
                  <span className="text-lg md:text-xl font-bold text-zinc-800 dark:text-white tabular-nums">{agentsWorking.count}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">agents working</span>
                </div>
              </div>
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
                See an agent finish a task.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Not suggestions—actions, approvals, and deliverables ready to ship.
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
                {demoTabs.map((tab, i) => (
                  <div key={tab.id} className="snap-center shrink-0 w-[85vw] max-w-sm">
                    <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm pr-2">{tab.title}</h3>
                        {tab.comingSoon && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 px-2 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0">
                            Coming soon
                          </span>
                        )}
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
                          href={tab.buttonAction === 'waitlist' ? '/sign-up?waitlist=phone-agent' : `/sign-up?example=${tab.id}`}
                          className={`block w-full py-2.5 text-center rounded-lg text-sm font-medium transition-all ${
                            tab.comingSoon
                              ? 'border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
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
                    <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2 flex items-center gap-3 flex-wrap">
                      {demoTabs[activeTab].title}
                      {demoTabs[activeTab].comingSoon && 'comingSoonBadge' in demoTabs[activeTab] && (
                        <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 px-3 py-1 rounded-full font-medium">
                          {(demoTabs[activeTab] as any).comingSoonBadge}
                        </span>
                      )}
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
                    href={demoTabs[activeTab].buttonAction === 'waitlist' ? '/sign-up?waitlist=phone-agent' : `/sign-up?example=${demoTabs[activeTab].id}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all text-sm"
                  >
                    {demoTabs[activeTab].buttonText}
                  </Link>
                </div>

                {/* Right - chat mock */}
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
                Set the job once. Get outputs continuously.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {[
                { num: 1, title: 'Describe the job (or start from an example)', desc: 'Write a simple instruction or copy a starter job.' },
                { num: 2, title: 'Connect your tools', desc: 'Grant only the access you want the agent to have.' },
                { num: 3, title: 'Choose autonomy', desc: 'Read-only, approval-first, or autopilot for safe tasks. Start approval-first. Turn on autopilot later.' },
                { num: 4, title: 'Get deliverables', desc: 'Results arrive as emails, docs, updates, and messages—ready to use.' },
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
                Agents can browse, write, and take actions—while you decide what requires approval.
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
                Connect tools once. Deliver outputs where they belong.
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
                Automna is built to run workflows—on a schedule, across tools, with control.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6">
                <div className="text-zinc-400 dark:text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3 md:mb-4">Chat assistants</div>
                <ul className="space-y-2.5 md:space-y-3">
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
                    Doesn&apos;t run on a schedule by itself
                  </li>
                  <li className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="text-zinc-300 dark:text-zinc-600">✗</span>
                    Outputs often live in the chat window
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-500/10 dark:to-violet-500/5 border-2 border-purple-200 dark:border-purple-500/30 rounded-xl p-5 md:p-6">
                <div className="text-purple-600 dark:text-purple-400 text-xs font-medium uppercase tracking-wider mb-3 md:mb-4">Automna agents</div>
                <ul className="space-y-2.5 md:space-y-3">
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
        <section id="security" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Permissions and control by design.
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                You decide what the agent can access—and what it&apos;s allowed to do.
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-6 md:p-8">
              <ul className="space-y-3 md:space-y-4">
                {[
                  { title: 'Connect only the tools you want (scoped access)', desc: 'Grant permissions per integration. Revoke anytime.' },
                  { title: 'Approval-only mode for sensitive actions', desc: 'Review before sending, publishing, or modifying data.' },
                  { title: 'Review outputs before sending or publishing', desc: 'Drafts queue for your approval. You have final say.' },
                  { title: 'Revoke access at any time', desc: 'Disconnect tools instantly from your dashboard.' },
                  { title: 'Action history / audit log', desc: 'See what it did, step by step. Full transparency.' },
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

        {/* Pricing */}
        <section id="pricing" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold mb-3 text-zinc-900 dark:text-white">
                Simple, transparent pricing
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg">
                Start small. Scale when ready.
              </p>
              <p className="text-zinc-400 dark:text-zinc-500 text-xs md:text-sm mt-2">
                If Automna saves you ~2 hours/month, Pro pays for itself.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
              {/* Starter */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 rounded-xl p-5 md:p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all">
                <h3 className="text-lg md:text-xl font-semibold text-zinc-900 dark:text-white">Starter</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-3 md:mb-4">Get started</p>
                <div className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-zinc-900 dark:text-white">
                  $79<span className="text-base text-zinc-400 dark:text-zinc-500 font-normal">/mo</span>
                </div>
                <ul className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Your own AI agent
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Web chat + 1 integration
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Browser access
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Personal email inbox
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    500K tokens/month
                  </li>
                </ul>
                <Link
                  href="/sign-up?plan=starter"
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all text-sm"
                >
                  Start Starter
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
                    All integrations
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Inbound & outbound phone calls
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    2M tokens/month
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Unlimited memory
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">✓</span>
                    Email support
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
                    Inbound & outbound phone calls
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    Team workspace
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-700 dark:text-zinc-300 text-sm">
                    <span className="text-zinc-400 dark:text-zinc-600 text-xs">✓</span>
                    10M tokens/month
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
                  className="block w-full py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg font-medium text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-all text-sm"
                >
                  Start Business
                </Link>
              </div>
            </div>

            <p className="text-center text-zinc-500 dark:text-zinc-400 text-xs md:text-sm mt-5 md:mt-6">
              All plans include Claude AI. No API key needed.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="container mx-auto px-6 py-10 md:py-24 bg-zinc-50/50 dark:bg-zinc-900/30">
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
        <section id="final-cta" className="container mx-auto px-6 py-10 md:py-24">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-4 text-zinc-900 dark:text-white">
              Ready to delegate?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-lg mb-6 md:mb-8">
              Get Work Done in minutes. Keep control with approvals.
            </p>

            <div className="hidden md:flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/sign-up"
                className="px-8 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-200 dark:shadow-purple-500/25"
              >
                Get Work Done
              </Link>
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
