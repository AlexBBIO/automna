'use client';

import { useState, useEffect } from 'react';
const quotes = [
  { start: "You look like you could use", end: "cutting-edge AI infrastructure", tagline: "I can provide that." },
  { start: "You look like you need", end: "a personal agent that actually works", tagline: "I can be that." },
  { start: "You look lonely", end: "like you need some company", tagline: "I can fix that." },
  { start: "You seem tired of", end: "browsing the web yourself", tagline: "I can automate that." },
  { start: "You look exhausted from", end: "doing repetitive tasks", tagline: "I can handle that." },
  { start: "You look like you deserve", end: "an AI that remembers everything", tagline: "I can do that." },
  { start: "You seem ready for", end: "the future of personal computing", tagline: "I can show you." },
  { start: "You look like you need", end: "genetic solutions... I mean, AI solutions", tagline: "I can help with that." },
];

export default function JoiPage() {
  const [currentQuote, setCurrentQuote] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [displayedEnd, setDisplayedEnd] = useState('');
  const [showTagline, setShowTagline] = useState(false);

  useEffect(() => {
    const quote = quotes[currentQuote];
    
    if (isTyping) {
      if (displayedEnd.length < quote.end.length) {
        const timeout = setTimeout(() => {
          setDisplayedEnd(quote.end.slice(0, displayedEnd.length + 1));
        }, 50);
        return () => clearTimeout(timeout);
      } else {
        const timeout = setTimeout(() => {
          setShowTagline(true);
        }, 300);
        return () => clearTimeout(timeout);
      }
    }
  }, [currentQuote, displayedEnd, isTyping]);

  useEffect(() => {
    if (showTagline) {
      const timeout = setTimeout(() => {
        setShowTagline(false);
        setIsTyping(false);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [showTagline]);

  useEffect(() => {
    if (!isTyping && !showTagline) {
      const timeout = setTimeout(() => {
        setDisplayedEnd('');
        setCurrentQuote((prev) => (prev + 1) % quotes.length);
        setIsTyping(true);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isTyping, showTagline]);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-black to-cyan-900/20" />
      
      {/* Animated background particles/glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-16">
        
        {/* Joi hologram video */}
        <div className="relative w-full max-w-3xl mb-16">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10 pointer-events-none" />
          
          {/* Glow effect behind video */}
          <div className="absolute inset-0 flex items-center justify-center -z-10">
            <div 
              className="w-3/4 h-3/4 bg-gradient-to-r from-pink-500/30 to-cyan-500/30 rounded-full blur-3xl"
              style={{
                animation: 'glow 4s ease-in-out infinite',
              }}
            />
          </div>
          
          <video
            src="/joi-hero.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-auto rounded-lg"
            style={{
              filter: 'drop-shadow(0 0 40px rgba(236, 72, 153, 0.6)) drop-shadow(0 0 80px rgba(6, 182, 212, 0.4))',
            }}
          />
        </div>

        {/* Speech bubble / Quote area */}
        <div className="text-center max-w-2xl mb-16">
          <div className="text-3xl md:text-5xl font-light tracking-wide mb-3">
            <span className="text-pink-400">{quotes[currentQuote].start}</span>
          </div>
          <div className="text-3xl md:text-5xl font-bold min-h-[4rem]">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400">
              {displayedEnd}
            </span>
            {isTyping && <span className="animate-pulse text-cyan-400">|</span>}
          </div>
          <div className={`text-2xl md:text-3xl mt-4 text-gray-300 italic transition-opacity duration-300 ${showTagline ? 'opacity-100' : 'opacity-0'}`}>
            {quotes[currentQuote].tagline}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-6 mb-8">
          <a
            href="/"
            className="group relative inline-flex items-center justify-center"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-cyan-500 blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            
            {/* Button */}
            <div className="relative px-10 py-4 rounded-full bg-gradient-to-r from-pink-600 to-cyan-600 
                          text-lg font-semibold tracking-wide
                          border border-white/20
                          shadow-lg shadow-pink-500/25
                          group-hover:shadow-xl group-hover:shadow-pink-500/40
                          group-hover:scale-105 transition-all duration-300">
              Meet Automna
            </div>
          </a>
          
          <p className="text-gray-400 text-sm tracking-widest uppercase">Your AI companion awaits</p>
        </div>

      </div>

      {/* Global keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
      `}} />
    </div>
  );
}
