'use client';

interface ChatSkeletonProps {
  phase?: 'connecting' | 'warming' | 'loading-history' | 'ready';
  message?: string;
}

export function ChatSkeleton({ phase = 'connecting', message }: ChatSkeletonProps) {
  const phases = {
    connecting: { progress: 25, text: 'Connecting to your agent...' },
    warming: { progress: 50, text: 'Starting workspace...' },
    'loading-history': { progress: 75, text: 'Loading conversation...' },
    ready: { progress: 100, text: 'Ready!' },
  };

  const current = phases[phase];

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Skeleton messages */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* User message skeleton */}
        <div className="flex justify-end">
          <div className="bg-gray-800/50 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-48"></div>
          </div>
        </div>
        
        {/* Assistant message skeleton */}
        <div className="flex justify-start">
          <div className="bg-gray-800/50 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2">
            <div className="h-4 bg-gray-700 rounded w-64"></div>
            <div className="h-4 bg-gray-700 rounded w-56"></div>
            <div className="h-4 bg-gray-700 rounded w-40"></div>
          </div>
        </div>

        {/* Another user message */}
        <div className="flex justify-end">
          <div className="bg-gray-800/50 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-32"></div>
          </div>
        </div>

        {/* Another assistant message */}
        <div className="flex justify-start">
          <div className="bg-gray-800/50 rounded-2xl px-4 py-3 max-w-[70%] animate-pulse space-y-2">
            <div className="h-4 bg-gray-700 rounded w-72"></div>
            <div className="h-4 bg-gray-700 rounded w-48"></div>
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      <div className="border-t border-gray-800 p-4">
        <div className="max-w-2xl mx-auto">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
                style={{ width: `${current.progress}%` }}
              />
            </div>
          </div>
          
          {/* Status text */}
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span>{message || current.text}</span>
          </div>
        </div>
      </div>

      {/* Disabled input skeleton */}
      <div className="border-t border-gray-800 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl p-3 opacity-50">
            <div className="flex-1 h-6 bg-gray-700/50 rounded"></div>
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
