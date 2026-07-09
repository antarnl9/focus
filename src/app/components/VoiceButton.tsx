'use client';

import { useRef, useState } from 'react';

// Dictado por voz (es-MX) usando Web Speech API donde esté disponible.
export function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<any>(null);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'es-MX';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join(' ');
      onText(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`grid h-7 w-7 place-items-center rounded-full text-sm ${
        listening ? 'animate-pulse bg-urgent text-white' : 'bg-ink-700 text-slate-300'
      }`}
      aria-label="Dictar"
      title="Dictar por voz"
    >
      {listening ? '⏺' : '🎤'}
    </button>
  );
}
