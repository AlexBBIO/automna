'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

// ─── Section data ────────────────────────────────────────────────────────────

interface DocSection {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

const sections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    content: <GettingStarted />,
  },
  {
    id: 'chat-commands',
    title: 'Chat & Commands',
    icon: '💬',
    content: <ChatCommands />,
  },
  {
    id: 'email',
    title: 'Email',
    icon: '📧',
    content: <Email />,
  },
  {
    id: 'phone',
    title: 'Phone Calls',
    icon: '📞',
    content: <Phone />,
  },
  {
    id: 'files',
    title: 'Files & Storage',
    icon: '📁',
    content: <Files />,
  },
  {
    id: 'memory',
    title: 'Memory & Personality',
    icon: '🧠',
    content: <Memory />,
  },
  {
    id: 'browser',
    title: 'Web Browsing',
    icon: '🌐',
    content: <Browser />,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: '🔗',
    content: <Integrations />,
  },
  {
    id: 'security',
    title: 'Security & Privacy',
    icon: '🔒',
    content: <Security />,
  },
  {
    id: 'billing',
    title: 'Plans & Billing',
    icon: '💳',
    content: <Billing />,
  },
];

// ─── Reusable components ─────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 mt-8 first:mt-0">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-3 mt-6">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400 space-y-2 mb-4 ml-1">{children}</ul>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal list-inside text-zinc-600 dark:text-zinc-400 space-y-2 mb-4 ml-1">{children}</ol>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono text-purple-600 dark:text-purple-400">{children}</code>;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 mb-4 overflow-x-auto">
      <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre">{children}</code>
    </pre>
  );
}

function Callout({ type = 'info', children }: { type?: 'info' | 'tip' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
    tip: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
  };
  const icons = { info: 'ℹ️', tip: '💡', warning: '⚠️' };
  return (
    <div className={`border rounded-lg p-4 mb-4 ${styles[type]}`}>
      <span className="mr-2">{icons[type]}</span>
      {children}
    </div>
  );
}

function Badge({ children, color = 'purple' }: { children: React.ReactNode; color?: 'purple' | 'green' | 'amber' | 'zinc' }) {
  const styles = {
    purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

// ─── Section content ─────────────────────────────────────────────────────────

function GettingStarted() {
  return (
    <div>
      <H2>Getting Started</H2>
      <P>
        Welcome to Automna. When you sign up and choose a plan, we provision a dedicated AI agent just for you.
        It runs on its own isolated server with its own memory, files, and tools. Nobody else can access it.
      </P>

      <H3>What happens when you sign up</H3>
      <Ol>
        <li>You create an account and pick a plan</li>
        <li>We spin up your agent in about 60 seconds</li>
        <li>Your agent introduces itself and asks you a few questions (your name, what to call it, etc.)</li>
        <li>From there, just start chatting and giving it tasks</li>
      </Ol>

      <H3>First conversation</H3>
      <P>
        Your agent starts with a bootstrap process. It will ask you things like:
      </P>
      <Ul>
        <li><strong>Your name</strong> and how you want to be addressed</li>
        <li><strong>Its name</strong> — pick something you like, or let it suggest options</li>
        <li><strong>Its personality</strong> — casual, formal, snarky, warm, whatever feels right</li>
        <li><strong>Your timezone</strong> — so it can handle scheduling correctly</li>
      </Ul>
      <P>
        After this setup, your agent saves everything and remembers it across sessions.
        You can always update these later by editing its personality files or just asking it to change.
      </P>

      <H3>The dashboard</H3>
      <P>
        Your dashboard at <strong>automna.ai</strong> is where you interact with your agent.
        It includes:
      </P>
      <Ul>
        <li><strong>Chat</strong> — your main conversation interface</li>
        <li><strong>Conversations</strong> — multiple threads, each with its own context</li>
        <li><strong>Files</strong> — browse, upload, and download files from your agent&apos;s workspace</li>
        <li><strong>Settings</strong> — manage secrets, integrations, and preferences</li>
      </Ul>

      <Callout type="tip">
        Start a new conversation with <Code>/new</Code> whenever you want a fresh context.
        Your agent still remembers long-term info — it just gets a clean chat thread.
      </Callout>
    </div>
  );
}

function ChatCommands() {
  return (
    <div>
      <H2>Chat & Commands</H2>
      <P>
        You talk to your agent through the chat interface. Just type naturally — describe what you want done,
        ask questions, or give instructions. Your agent understands context and can handle multi-step tasks.
      </P>

      <H3>Slash commands</H3>
      <P>
        Commands start with <Code>/</Code> and give you direct control over your agent&apos;s behavior.
        Send them as standalone messages.
      </P>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 pr-4 font-medium text-zinc-700 dark:text-zinc-300">Command</th>
              <th className="text-left py-2 font-medium text-zinc-700 dark:text-zinc-300">What it does</th>
            </tr>
          </thead>
          <tbody className="text-zinc-600 dark:text-zinc-400">
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/new</td>
              <td className="py-2">Start a fresh conversation (agent keeps long-term memory)</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/status</td>
              <td className="py-2">See current agent status, model, and usage</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/model</td>
              <td className="py-2">View or switch the AI model your agent uses</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/model list</td>
              <td className="py-2">See all available models with a numbered picker</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/stop</td>
              <td className="py-2">Interrupt the agent&apos;s current response</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/help</td>
              <td className="py-2">Show available commands</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/usage</td>
              <td className="py-2">Toggle token usage display (<Code>off</Code>, <Code>tokens</Code>, <Code>full</Code>, <Code>cost</Code>)</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/think</td>
              <td className="py-2">Control thinking depth (<Code>off</Code>, <Code>low</Code>, <Code>medium</Code>, <Code>high</Code>)</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/context</td>
              <td className="py-2">See what&apos;s in your agent&apos;s current context window</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/compact</td>
              <td className="py-2">Compress the conversation to free up context space</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/tts</td>
              <td className="py-2">Toggle text-to-speech for responses</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-purple-600 dark:text-purple-400">/skill &lt;name&gt;</td>
              <td className="py-2">Run an installed skill by name</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H3>Inline directives</H3>
      <P>
        Some commands can be added inline with your message. They&apos;re stripped before the agent sees the text:
      </P>
      <Ul>
        <li><Code>/think high</Code> — use deeper reasoning for this message</li>
        <li><Code>/model sonnet</Code> — use a specific model for this message</li>
      </Ul>
      <P>
        When used inline (with other text), directives apply only to that message.
        When sent alone, they persist for the session.
      </P>

      <H3>Conversations</H3>
      <P>
        You can run multiple conversations simultaneously. Each conversation has its own context window,
        but your agent&apos;s long-term memory is shared across all of them.
      </P>
      <Ul>
        <li>Use <Code>/new</Code> to start a fresh conversation</li>
        <li>Switch between conversations in the sidebar</li>
        <li>Each conversation can use a different model if needed</li>
      </Ul>

      <H3>Sub-agents</H3>
      <P>
        Your agent can spawn background workers (sub-agents) for long-running tasks.
        You can check on them with:
      </P>
      <Ul>
        <li><Code>/subagents list</Code> — see running sub-agents</li>
        <li><Code>/subagents log</Code> — view a sub-agent&apos;s output</li>
        <li><Code>/subagents stop</Code> — cancel a sub-agent</li>
      </Ul>
    </div>
  );
}

function Email() {
  return (
    <div>
      <H2>Email</H2>
      <P>
        Every Automna agent gets its own email address. Your agent can send and receive emails on your behalf,
        making it useful for outreach, follow-ups, notifications, and more.
      </P>

      <H3>Your agent&apos;s email address</H3>
      <P>
        When your account is provisioned, your agent is assigned a unique email address like:
      </P>
      <CodeBlock>{`swiftfox@mail.automna.ai`}</CodeBlock>
      <P>
        The name is randomly generated (adjective + noun) and is yours permanently.
        Your agent knows its own email address and will use it when sending messages.
      </P>

      <H3>Sending emails</H3>
      <P>
        Just ask your agent to send an email. For example:
      </P>
      <CodeBlock>{`"Send an email to john@example.com introducing our company
and asking about partnership opportunities"`}</CodeBlock>
      <P>
        Your agent will compose and send the email. It can:
      </P>
      <Ul>
        <li>Draft professional emails based on your instructions</li>
        <li>Follow up on previous conversations</li>
        <li>Send attachments from its file system</li>
        <li>Handle bulk outreach with personalization</li>
      </Ul>

      <H3>Receiving emails</H3>
      <P>
        When someone replies to your agent&apos;s email, the response arrives in its inbox automatically.
        Your agent can:
      </P>
      <Ul>
        <li>Check for new emails proactively (via heartbeat)</li>
        <li>Notify you when important replies arrive</li>
        <li>Draft responses for your review</li>
        <li>Auto-respond based on rules you set</li>
      </Ul>

      <H3>Limits</H3>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 pr-4 font-medium text-zinc-700 dark:text-zinc-300">Limit</th>
              <th className="text-left py-2 font-medium text-zinc-700 dark:text-zinc-300">Value</th>
            </tr>
          </thead>
          <tbody className="text-zinc-600 dark:text-zinc-400">
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4">Emails per day</td>
              <td className="py-2">50</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4">Email domain</td>
              <td className="py-2">@mail.automna.ai</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Custom domain</td>
              <td className="py-2">Coming soon (Business tier)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="info">
        Your agent&apos;s email is fully authenticated with SPF, DKIM, and DMARC records,
        so messages are much less likely to land in spam.
      </Callout>
    </div>
  );
}

function Phone() {
  return (
    <div>
      <H2>Phone Calls</H2>
      <Badge color="purple">Pro & Business</Badge>
      <P>
        Pro and Business tier agents get a dedicated US phone number and can make or receive AI-powered voice calls.
      </P>

      <H3>Your phone number</H3>
      <P>
        When you upgrade to Pro or Business, a US phone number is automatically provisioned for your agent.
        Your agent can use this number to:
      </P>
      <Ul>
        <li><strong>Make outbound calls</strong> — cold outreach, follow-ups, appointment confirmations</li>
        <li><strong>Receive inbound calls</strong> — handle inquiries, qualify leads, take messages</li>
      </Ul>

      <H3>Making a call</H3>
      <P>
        Ask your agent to call someone:
      </P>
      <CodeBlock>{`"Call +1-555-123-4567 and ask about their availability
for a meeting next week. Be professional and friendly."`}</CodeBlock>
      <P>
        Your agent will:
      </P>
      <Ol>
        <li>Place the call from its dedicated number</li>
        <li>Follow your instructions during the conversation</li>
        <li>Record the call (with disclosure)</li>
        <li>Deliver a transcript and summary to you when it&apos;s done</li>
      </Ol>

      <H3>Receiving calls</H3>
      <P>
        Configure how your agent handles incoming calls. You can set:
      </P>
      <Ul>
        <li><strong>Greeting</strong> — what the agent says when it picks up</li>
        <li><strong>Instructions</strong> — how to handle different types of callers</li>
        <li><strong>Voice</strong> — choose from available AI voices</li>
      </Ul>
      <P>
        After each call, your agent saves a transcript to its files and can take follow-up actions
        like sending an email, creating a calendar event, or notifying you in chat.
      </P>

      <H3>Call limits</H3>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 pr-4 font-medium text-zinc-700 dark:text-zinc-300">Plan</th>
              <th className="text-left py-2 font-medium text-zinc-700 dark:text-zinc-300">Minutes/month</th>
            </tr>
          </thead>
          <tbody className="text-zinc-600 dark:text-zinc-400">
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4">Starter</td>
              <td className="py-2">Not available</td>
            </tr>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
              <td className="py-2 pr-4">Pro</td>
              <td className="py-2">60 minutes</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Business</td>
              <td className="py-2">300 minutes</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout type="tip">
        Transcripts are saved to the <Code>calls/</Code> folder in your agent&apos;s workspace.
        You can browse them in the Files tab or ask your agent to summarize past calls.
      </Callout>
    </div>
  );
}

function Files() {
  return (
    <div>
      <H2>Files & Storage</H2>
      <P>
        Your agent has its own file system — a persistent workspace where it stores files, notes, code,
        and anything else it creates or you upload.
      </P>

      <H3>File browser</H3>
      <P>
        Access the file browser from the sidebar in your dashboard.
        You can:
      </P>
      <Ul>
        <li><strong>Browse</strong> — navigate your agent&apos;s workspace folder structure</li>
        <li><strong>Upload</strong> — drag and drop files for your agent to work with</li>
        <li><strong>Download</strong> — grab any file your agent has created</li>
        <li><strong>Preview</strong> — view images, markdown, and code files inline</li>
      </Ul>

      <H3>Workspace structure</H3>
      <P>
        Your agent&apos;s workspace has a standard layout:
      </P>
      <CodeBlock>{`workspace/
├── SOUL.md          # Agent personality (you can edit this!)
├── USER.md          # Info about you
├── IDENTITY.md      # Agent's name, emoji, vibe
├── TOOLS.md         # Local notes and tool configs
├── MEMORY.md        # Long-term curated memory
├── AGENTS.md        # Behavior instructions
├── HEARTBEAT.md     # Background task instructions
├── memory/          # Daily session notes
│   ├── 2026-02-07.md
│   └── 2026-02-08.md
├── uploads/         # Files you've uploaded
└── calls/           # Phone call transcripts`}</CodeBlock>

      <H3>Editing personality files</H3>
      <P>
        Some files directly control your agent&apos;s behavior. You can edit them through the file browser
        or just ask your agent to update them:
      </P>
      <Ul>
        <li><strong>SOUL.md</strong> — your agent&apos;s personality, tone, and values</li>
        <li><strong>USER.md</strong> — info about you (name, timezone, preferences)</li>
        <li><strong>IDENTITY.md</strong> — agent&apos;s name, emoji, creature type</li>
        <li><strong>HEARTBEAT.md</strong> — what your agent checks on proactively</li>
      </Ul>

      <H3>Storage</H3>
      <P>
        Each agent gets 1 GB of encrypted persistent storage. This persists across restarts
        and is fully isolated — no one else can access your files.
      </P>

      <Callout type="info">
        Files your agent creates (reports, code, images) appear instantly in the file browser.
        You don&apos;t need to wait for the conversation to finish.
      </Callout>
    </div>
  );
}

function Memory() {
  return (
    <div>
      <H2>Memory & Personality</H2>
      <P>
        Your agent remembers things across conversations. It maintains both short-term context
        (the current chat) and long-term memory (written to files that persist forever).
      </P>

      <H3>How memory works</H3>
      <P>
        Your agent uses two memory systems:
      </P>
      <Ul>
        <li>
          <strong>Daily notes</strong> (<Code>memory/YYYY-MM-DD.md</Code>) — a running log of what happened each day.
          Your agent reads today and yesterday&apos;s notes at the start of each session.
        </li>
        <li>
          <strong>Long-term memory</strong> (<Code>MEMORY.md</Code>) — curated important information, decisions,
          and context your agent actively maintains.
        </li>
      </Ul>
      <P>
        There&apos;s also a semantic memory search that indexes your agent&apos;s files and past conversations,
        so it can recall relevant information even from weeks ago.
      </P>

      <H3>Telling your agent to remember things</H3>
      <P>
        You can explicitly ask your agent to remember something:
      </P>
      <CodeBlock>{`"Remember that our quarterly meeting is always the first
Monday of the month at 10am Pacific"`}</CodeBlock>
      <P>
        Your agent will write this to its memory files so it persists.
        You don&apos;t need to repeat yourself — it will know this going forward.
      </P>

      <H3>Automatic memory</H3>
      <P>
        Your agent also automatically extracts and remembers:
      </P>
      <Ul>
        <li>Your name, preferences, and communication style</li>
        <li>Important facts that come up in conversation</li>
        <li>Decisions you&apos;ve made together</li>
        <li>Project context and ongoing work</li>
      </Ul>

      <H3>Customizing personality</H3>
      <P>
        Your agent&apos;s personality is defined in <Code>SOUL.md</Code>. You can edit it anytime to change how
        your agent communicates. Some things you can customize:
      </P>
      <Ul>
        <li><strong>Tone</strong> — formal, casual, snarky, warm, professional</li>
        <li><strong>Communication style</strong> — concise vs. detailed, emoji usage, formatting</li>
        <li><strong>Values</strong> — what it prioritizes (accuracy, speed, creativity)</li>
        <li><strong>Boundaries</strong> — what it should or shouldn&apos;t do</li>
      </Ul>

      <Callout type="tip">
        Try saying: &quot;Be more concise in your responses&quot; or &quot;Use more emoji&quot; — your agent will
        update its personality file to match.
      </Callout>

      <H3>Resetting your agent</H3>
      <P>
        If you want to start completely fresh, you can reset your agent from your profile settings.
        This clears all conversations and memory files but preserves your integrations, email address,
        and browser logins.
      </P>
    </div>
  );
}

function Browser() {
  return (
    <div>
      <H2>Web Browsing</H2>
      <P>
        Your agent can browse the web using a real cloud browser. It can navigate websites,
        fill out forms, extract data, and interact with web apps — just like you would.
      </P>

      <H3>What your agent can do</H3>
      <Ul>
        <li><strong>Search the web</strong> — find information, research topics, check facts</li>
        <li><strong>Navigate websites</strong> — click through pages, read content, extract data</li>
        <li><strong>Fill forms</strong> — submit applications, sign up for services, place orders</li>
        <li><strong>Monitor pages</strong> — watch for changes, price drops, new listings</li>
        <li><strong>Take screenshots</strong> — capture what it sees for your review</li>
      </Ul>

      <H3>Persistent logins</H3>
      <P>
        Your agent&apos;s browser maintains persistent sessions. If you log it into a website (like LinkedIn,
        your CRM, or a social platform), it stays logged in across conversations. No need to re-authenticate
        every time.
      </P>

      <H3>How to use it</H3>
      <P>
        Just describe what you need:
      </P>
      <CodeBlock>{`"Go to LinkedIn and find 10 product managers
in San Francisco who work at Series B startups"`}</CodeBlock>
      <CodeBlock>{`"Check my Shopify dashboard and tell me
today's revenue and top-selling products"`}</CodeBlock>
      <P>
        Your agent handles the browsing automatically. It will report back with results
        and can save extracted data as files.
      </P>

      <Callout type="info">
        The cloud browser includes built-in CAPTCHA solving and stealth mode, so it works on
        most websites without getting blocked.
      </Callout>
    </div>
  );
}

function Integrations() {
  return (
    <div>
      <H2>Integrations</H2>
      <P>
        Connect your agent to the platforms you already use. Once connected, your agent can
        send and receive messages across channels, keeping context no matter where you talk.
      </P>

      <H3>Available integrations</H3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {[
          { name: 'Discord', status: 'Available', desc: 'Add your agent to Discord servers and DMs' },
          { name: 'Telegram', status: 'Available', desc: 'Create a Telegram bot for your agent' },
          { name: 'Slack', status: 'Available', desc: 'Install your agent in Slack workspaces' },
          { name: 'WhatsApp', status: 'Available', desc: 'Link your WhatsApp for direct messaging' },
          { name: 'GitHub', status: 'Available', desc: 'Manage repos, issues, and PRs' },
          { name: 'Notion', status: 'Coming Soon', desc: 'Read and write Notion pages and databases' },
        ].map((integration) => (
          <div
            key={integration.name}
            className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-zinc-900 dark:text-white text-sm">{integration.name}</span>
              <Badge color={integration.status === 'Available' ? 'green' : 'amber'}>
                {integration.status}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">{integration.desc}</p>
          </div>
        ))}
      </div>

      <H3>Setting up an integration</H3>
      <P>
        Most integrations require adding a secret (API token, bot token, etc.) to your agent&apos;s settings.
        The general process:
      </P>
      <Ol>
        <li>Go to the Settings panel in your dashboard</li>
        <li>Add the required credential as a secret (e.g., <Code>DISCORD_TOKEN</Code>)</li>
        <li>Your agent will detect the new secret and configure the integration</li>
        <li>Or, ask your agent to walk you through the setup</li>
      </Ol>

      <H3>Secrets management</H3>
      <P>
        API keys and tokens are stored securely as encrypted secrets. They never appear in chat history
        and are only accessible to your agent&apos;s runtime.
      </P>
      <Ul>
        <li>Add secrets via the Settings panel</li>
        <li>Secrets are encrypted at rest</li>
        <li>Your agent accesses them as environment variables</li>
        <li>You can update or delete secrets anytime</li>
      </Ul>

      <Callout type="warning">
        Never paste API keys directly in chat. Use the Secrets panel instead.
        If you accidentally share a key in chat, rotate it immediately.
      </Callout>
    </div>
  );
}

function Security() {
  return (
    <div>
      <H2>Security & Privacy</H2>
      <P>
        Your data security is fundamental to how Automna works. Every agent runs in complete isolation
        with multiple layers of protection.
      </P>

      <H3>Isolation</H3>
      <Ul>
        <li><strong>Dedicated server</strong> — your agent runs on its own virtual machine, not shared with anyone</li>
        <li><strong>Encrypted storage</strong> — your 1 GB volume is encrypted at rest</li>
        <li><strong>Private network</strong> — your agent&apos;s server is not accessible from the public internet</li>
        <li><strong>No shared data</strong> — your conversations, files, and memory are completely isolated</li>
      </Ul>

      <H3>API key security</H3>
      <P>
        Automna never exposes real API keys to your agent&apos;s machine. All external API calls (AI models,
        search, browser, email) are routed through authenticated proxies on our infrastructure.
        Your agent uses a single gateway token that authenticates everything.
      </P>
      <Ul>
        <li>No API keys stored on your server</li>
        <li>All LLM traffic routed through our proxy</li>
        <li>Gateway token can be rotated anytime</li>
        <li>Rate limits enforced server-side</li>
      </Ul>

      <H3>Data handling</H3>
      <Ul>
        <li><strong>We don&apos;t train on your data</strong> — your conversations are never used for model training</li>
        <li><strong>We don&apos;t read your data</strong> — only your agent accesses your files and conversations</li>
        <li><strong>You own your data</strong> — download or delete everything anytime</li>
        <li><strong>Minimal logging</strong> — we log usage metrics, not message content</li>
      </Ul>

      <H3>Account security</H3>
      <Ul>
        <li>Authentication powered by Clerk (SOC 2 compliant)</li>
        <li>Support for social login (Google, GitHub) and email/password</li>
        <li>Session tokens expire and auto-refresh</li>
      </Ul>

      <Callout type="info">
        Have a security concern? Contact us at{' '}
        <a href="mailto:alex@automna.ai" className="text-purple-600 dark:text-purple-400 hover:underline">
          alex@automna.ai
        </a>
      </Callout>
    </div>
  );
}

function Billing() {
  return (
    <div>
      <H2>Plans & Billing</H2>
      <P>
        Automna offers three plans to fit different needs. All plans include a dedicated AI agent
        with persistent memory and file storage.
      </P>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          {
            name: 'Starter',
            price: '$79/mo',
            features: [
              'Your own AI agent',
              'Web chat + 1 integration',
              'Browser access',
              'Personal email inbox',
              '200K tokens/month',
            ],
          },
          {
            name: 'Pro',
            price: '$149/mo',
            popular: true,
            features: [
              'Everything in Starter',
              'All integrations',
              '1M tokens/month',
              'Phone number + 60 min calls',
              'Unlimited memory',
              'Custom skills',
            ],
          },
          {
            name: 'Business',
            price: '$299/mo',
            features: [
              'Everything in Pro',
              'Team workspace',
              '5M tokens/month',
              'Phone: 300 min calls',
              'API access',
              'Dedicated support',
            ],
          },
        ].map((plan) => (
          <div
            key={plan.name}
            className={`border rounded-lg p-4 ${
              plan.popular
                ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-zinc-900 dark:text-white">{plan.name}</span>
              {plan.popular && <Badge color="purple">Popular</Badge>}
            </div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">{plan.price}</div>
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <H3>Understanding tokens</H3>
      <P>
        Tokens are the currency of AI conversations. Every message you send and every response your agent
        generates uses tokens. Roughly:
      </P>
      <Ul>
        <li><strong>1 token ≈ 4 characters</strong> of English text</li>
        <li>A typical back-and-forth message costs 1,000-3,000 tokens</li>
        <li>Complex tasks with tool use can cost 10,000-50,000 tokens per interaction</li>
        <li>The 500K Starter limit supports roughly 200-500 conversations/month</li>
      </Ul>

      <H3>Managing your subscription</H3>
      <P>
        Access billing from your dashboard profile menu. You can:
      </P>
      <Ul>
        <li>Upgrade or downgrade your plan</li>
        <li>Update payment information</li>
        <li>View invoices and usage history</li>
        <li>Cancel your subscription</li>
      </Ul>

      <Callout type="tip">
        Running low on tokens? Use <Code>/usage</Code> to see your current consumption,
        or ask your agent &quot;How many tokens have I used this month?&quot;
      </Callout>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    // Check hash on load
    const hash = window.location.hash.slice(1);
    if (hash && sections.find((s) => s.id === hash)) {
      setActiveSection(hash);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', `#${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentSection = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white antialiased transition-colors">
      {/* Nav */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800'
            : 'bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-semibold tracking-tight">
              <span className="text-purple-600 dark:text-purple-400">Auto</span>mna
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hidden sm:inline">Docs</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <ThemeToggle />
            <Link
              href="/sign-up"
              className="hidden sm:inline-block px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-all"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-[65px] flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto">
          <nav className="p-4 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 ${
                  activeSection === section.id
                    ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span className="text-base">{section.icon}</span>
                {section.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile section picker */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2">
              <span>{currentSection.icon}</span>
              <span className="font-medium text-zinc-900 dark:text-white">{currentSection.title}</span>
            </span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {mobileMenuOpen && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-[60vh] overflow-y-auto px-4 py-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2.5 ${
                    activeSection === section.id
                      ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <span className="text-base">{section.icon}</span>
                  {section.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-8">
          <div className="max-w-3xl mx-auto px-6 py-8 lg:py-12">{currentSection.content}</div>
        </main>
      </div>
    </div>
  );
}
