'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

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
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        
        {/* Joi hologram image with animation */}
        <div 
          className="relative w-full max-w-2xl aspect-video mb-12"
          style={{
            animation: 'float 6s ease-in-out infinite',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
          
          {/* Glow effect behind image */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div 
              className="w-3/4 h-3/4 bg-gradient-to-r from-pink-500/20 to-cyan-500/20 rounded-full blur-3xl"
              style={{
                animation: 'glow 4s ease-in-out infinite',
              }}
            />
          </div>
          
          <Image
            src="/joi-hero.png"
            alt="AI Assistant"
            fill
            className="object-contain opacity-90"
            style={{
              filter: 'drop-shadow(0 0 40px rgba(236, 72, 153, 0.6)) drop-shadow(0 0 80px rgba(6, 182, 212, 0.4))',
              animation: 'breathe 4s ease-in-out infinite',
            }}
          />
        </div>

        {/* Speech bubble / Quote area */}
        <div className="text-center max-w-2xl mb-12">
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
        <div className="flex flex-col items-center gap-5">
          <a
            href="/"
            className="px-12 py-4 rounded-full text-lg font-medium transition-all duration-300
                     bg-white/10 backdrop-blur-sm border border-white/20
                     hover:bg-white/20 hover:border-white/30 hover:scale-105
                     text-white tracking-wide"
          >
            Meet Automna
          </a>
          <p className="text-gray-500 text-sm tracking-wide">Your AI companion awaits</p>
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
