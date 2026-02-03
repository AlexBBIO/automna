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

export function ChatSkeleton({ phase = 'connecting', message }: ChatSkeletonProps) {
  const [provisionStep, setProvisionStep] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);

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

  const phases = {
    connecting: { progress: 25, text: 'Connecting to your agent...' },
    provisioning: { progress: animatedProgress, text: provisioningSteps[provisionStep].text },
    warming: { progress: 85, text: 'Starting your agent...' },
    'loading-history': { progress: 95, text: 'Loading conversation...' },
    ready: { progress: 100, text: 'Ready!' },
  };

  const current = phases[phase] || phases.connecting;

  return (
    <div className="h-full flex flex-col bg-zinc-50">
      {/* Skeleton messages */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* User message skeleton */}
        <div className="flex justify-end">
          <div className="bg-purple-100 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
            <div className="h-4 bg-purple-200 rounded w-48"></div>
          </div>
        </div>
        
        {/* Assistant message skeleton */}
        <div className="flex justify-start">
          <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2 shadow-sm">
            <div className="h-4 bg-zinc-200 rounded w-64"></div>
            <div className="h-4 bg-zinc-200 rounded w-56"></div>
            <div className="h-4 bg-zinc-200 rounded w-40"></div>
          </div>
        </div>

        {/* Another user message */}
        <div className="flex justify-end">
          <div className="bg-purple-100 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
            <div className="h-4 bg-purple-200 rounded w-32"></div>
          </div>
        </div>

        {/* Another assistant message */}
        <div className="flex justify-start">
          <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2 shadow-sm">
            <div className="h-4 bg-zinc-200 rounded w-72"></div>
            <div className="h-4 bg-zinc-200 rounded w-48"></div>
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      <div className="border-t border-zinc-200 p-4 bg-white">
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-500 ease-out"
                style={{ width: `${current.progress}%` }}
              />
            </div>
          </div>
          
          {/* Status text */}
          <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
            <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span>{message || current.text}</span>
          </div>
        </div>
      </div>

      {/* Disabled input skeleton */}
      <div className="border-t border-zinc-200 p-4 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 bg-zinc-100 rounded-xl p-3 opacity-50">
            <div className="flex-1 h-6 bg-zinc-200 rounded"></div>
            <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
