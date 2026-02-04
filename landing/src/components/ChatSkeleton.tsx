'use client';

import { useState, useEffect } from 'react';

interface ChatSkeletonProps {
  phase?: 'connecting' | 'provisioning' | 'warming' | 'loading-history' | 'ready';
  message?: string;
}

// Provisioning steps shown during the ~60s wait
const provisioningSteps = [
  { text: 'Creating your agent...', duration: 8000 },
  { text: 'Setting up secure storage...', duration: 10000 },
  { text: 'Configuring workspace...', duration: 12000 },
  { text: 'Installing capabilities...', duration: 15000 },
  { text: 'Starting services...', duration: 15000 },
  { text: 'Almost ready...', duration: 20000 },
];

// Tips shown during provisioning to educate users
const provisioningTips = [
  { icon: '☁️', title: 'Always On', desc: 'Your agent lives in the cloud 24/7. Close the tab — it keeps working.' },
  { icon: '📁', title: 'Your Files, Your Agent', desc: 'Upload documents, code, or data. Your agent can read, edit, and create files that persist.' },
  { icon: '🧠', title: 'It Remembers You', desc: 'Your preferences, your projects, your context. No more starting from scratch.' },
  { icon: '💬', title: 'Chat From Anywhere', desc: 'Connect Discord or Telegram and talk to your agent from your favorite apps.' },
  { icon: '🔌', title: 'Integrated', desc: 'Email, calendar, web search, and more. Ask your agent what it can connect to!' },
  { icon: '🤖', title: 'Autonomous', desc: '"Research this and get back to me" — your agent can work on tasks while you\'re away.' },
];

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ChatSkeleton({ phase = 'connecting', message }: ChatSkeletonProps) {
  const [provisionStep, setProvisionStep] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);

  // Cycle through provisioning steps
  useEffect(() => {
    if (phase !== 'provisioning') {
      setProvisionStep(0);
      return;
    }

    let stepIndex = 0;
    const advanceStep = () => {
      stepIndex = (stepIndex + 1) % provisioningSteps.length;
      setProvisionStep(stepIndex);
    };

    let timeout: NodeJS.Timeout;
    const scheduleNext = () => {
      const currentStep = provisioningSteps[stepIndex];
      timeout = setTimeout(() => {
        advanceStep();
        scheduleNext();
      }, currentStep.duration);
    };
    scheduleNext();

    return () => clearTimeout(timeout);
  }, [phase]);

  // Smooth animated progress during provisioning
  useEffect(() => {
    if (phase !== 'provisioning') {
      setAnimatedProgress(0);
      return;
    }

    const startTime = Date.now();
    const duration = 80000;
    const startProgress = 10;
    const endProgress = 90;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(
        startProgress + (endProgress - startProgress) * (elapsed / duration),
        endProgress
      );
      setAnimatedProgress(progress);

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      }
    };

    const animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [phase]);

  // Elapsed time counter during provisioning
  useEffect(() => {
    if (phase !== 'provisioning') {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // Cycle through tips during provisioning
  useEffect(() => {
    if (phase !== 'provisioning') {
      setCurrentTip(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % provisioningTips.length);
    }, 5000); // Change tip every 5 seconds

    return () => clearInterval(interval);
  }, [phase]);

  const phases = {
    connecting: { progress: 25, text: 'Connecting to your agent...' },
    provisioning: { progress: animatedProgress, text: provisioningSteps[provisionStep].text },
    warming: { progress: 85, text: 'Starting your agent...' },
    'loading-history': { progress: 95, text: 'Loading conversation...' },
    ready: { progress: 100, text: 'Ready!' },
  };

  const current = phases[phase] || phases.connecting;

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors">
      {/* Content area */}
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        {/* Tip card during provisioning */}
        {phase === 'provisioning' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-sm w-full">
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-6 shadow-lg transition-all duration-300">
                <div className="text-center">
                  <div className="text-4xl mb-3">{provisioningTips[currentTip].icon}</div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                    {provisioningTips[currentTip].title}
                  </h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    {provisioningTips[currentTip].desc}
                  </p>
                </div>
                {/* Tip indicator dots */}
                <div className="flex justify-center gap-1.5 mt-4">
                  {provisioningTips.map((_, i) => (
                    <div 
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === currentTip 
                          ? 'bg-purple-500' 
                          : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-4">
                Setting up your personal AI agent...
              </p>
            </div>
          </div>
        )}

        {/* Skeleton messages for non-provisioning phases */}
        {phase !== 'provisioning' && (
          <div className="space-y-4">
            {/* User message skeleton */}
            <div className="flex justify-end">
              <div className="bg-purple-100 dark:bg-purple-900/30 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
                <div className="h-4 bg-purple-200 dark:bg-purple-800/50 rounded w-48"></div>
              </div>
            </div>
            
            {/* Assistant message skeleton */}
            <div className="flex justify-start">
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2 shadow-sm">
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-64"></div>
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-56"></div>
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-40"></div>
              </div>
            </div>

            {/* Another user message */}
            <div className="flex justify-end">
              <div className="bg-purple-100 dark:bg-purple-900/30 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
                <div className="h-4 bg-purple-200 dark:bg-purple-800/50 rounded w-32"></div>
              </div>
            </div>

            {/* Another assistant message */}
            <div className="flex justify-start">
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2 shadow-sm">
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-72"></div>
                <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-48"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 transition-colors">
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-500 ease-out"
                style={{ width: `${current.progress}%` }}
              />
            </div>
          </div>
          
          {/* Status text */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-sm">
              <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
              <span>{message || current.text}</span>
            </div>
            
            {/* Provisioning timer and estimate */}
            {phase === 'provisioning' && (
              <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                <span>This usually takes about 2 minutes</span>
                <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                  {formatElapsedTime(elapsedSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disabled input skeleton */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 transition-colors">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-3 opacity-50">
            <div className="flex-1 h-6 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
            <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-700 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
