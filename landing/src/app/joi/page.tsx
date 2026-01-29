'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const quotes = [
  { start: "You look like you could use", end: "cutting-edge AI infrastructure" },
  { start: "You look like you need", end: "a personal agent that actually works" },
  { start: "You look lonely", end: "I can automate that" },
  { start: "You seem like you want", end: "agents that browse the web for you" },
  { start: "You look like you're tired of", end: "doing repetitive tasks yourself" },
  { start: "You look like you deserve", end: "an AI that remembers everything" },
  { start: "You seem ready for", end: "the future of personal computing" },
  { start: "You look like you need", end: "genetic solutions... I mean, AI solutions" },
];

export default function JoiPage() {
  const [currentQuote, setCurrentQuote] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [displayedEnd, setDisplayedEnd] = useState('');

  useEffect(() => {
    const quote = quotes[currentQuote];
    
    if (isTyping) {
      if (displayedEnd.length < quote.end.length) {
        const timeout = setTimeout(() => {
          setDisplayedEnd(quote.end.slice(0, displayedEnd.length + 1));
        }, 50);
        return () => clearTimeout(timeout);
      } else {
        // Finished typing, wait then move to next
        const timeout = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
        return () => clearTimeout(timeout);
      }
    } else {
      // Reset and move to next quote
      const timeout = setTimeout(() => {
        setDisplayedEnd('');
        setCurrentQuote((prev) => (prev + 1) % quotes.length);
        setIsTyping(true);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [currentQuote, displayedEnd, isTyping]);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-black to-cyan-900/20" />
      
      {/* Rain effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="rain" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        
        {/* Joi hologram image */}
        <div className="relative w-full max-w-2xl aspect-square mb-8">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
          <Image
            src="/joi-hero.png"
            alt="AI Assistant"
            fill
            className="object-contain opacity-90"
            style={{
              filter: 'drop-shadow(0 0 30px rgba(236, 72, 153, 0.5)) drop-shadow(0 0 60px rgba(6, 182, 212, 0.3))',
            }}
          />
          
          {/* Glitch lines effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="h-px bg-cyan-400/30 absolute w-full" style={{ top: '20%', animation: 'glitch 3s infinite' }} />
            <div className="h-px bg-pink-400/30 absolute w-full" style={{ top: '45%', animation: 'glitch 2.5s infinite reverse' }} />
            <div className="h-px bg-cyan-400/30 absolute w-full" style={{ top: '70%', animation: 'glitch 4s infinite' }} />
          </div>
        </div>

        {/* Speech bubble / Quote area */}
        <div className="text-center max-w-2xl">
          <div className="text-3xl md:text-5xl font-light tracking-wide">
            <span className="text-pink-400">{quotes[currentQuote].start}</span>
          </div>
          <div className="text-3xl md:text-5xl font-bold mt-2 min-h-[3rem]">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400">
              {displayedEnd}
            </span>
            <span className="animate-pulse text-cyan-400">|</span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col items-center gap-4">
          <a
            href="/"
            className="px-8 py-4 bg-gradient-to-r from-pink-600 to-cyan-600 rounded-lg text-xl font-semibold 
                     hover:from-pink-500 hover:to-cyan-500 transition-all duration-300
                     shadow-lg shadow-pink-500/25 hover:shadow-pink-500/50"
          >
            Meet Automna
          </a>
          <p className="text-gray-500 text-sm">Your AI companion awaits</p>
        </div>

        {/* Automna logo */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="text-2xl font-bold tracking-wider">
            <span className="text-pink-400">AUTO</span>
            <span className="text-cyan-400">MNA</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes glitch {
          0%, 100% { opacity: 0; transform: translateX(0); }
          10% { opacity: 1; transform: translateX(-2px); }
          20% { opacity: 0; transform: translateX(2px); }
          30% { opacity: 1; transform: translateX(0); }
          40% { opacity: 0; }
        }
        
        .rain {
          position: absolute;
          width: 100%;
          height: 100%;
          background: linear-gradient(transparent 0%, rgba(6, 182, 212, 0.1) 50%, transparent 100%);
          background-size: 2px 20px;
          animation: rain 0.5s linear infinite;
        }
        
        @keyframes rain {
          0% { background-position: 0 0; }
          100% { background-position: 0 20px; }
        }
      `}</style>
    </div>
  );
}
