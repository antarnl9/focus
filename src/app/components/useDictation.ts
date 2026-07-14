'use client';

import { useRef, useState } from 'react';

// Dictado por voz (es-MX): va escribiendo el texto (parcial + final) sobre lo
// que ya había. Web Speech API donde esté disponible.
export function useDictation(onText: (text: string) => void, getBase: () => string) {
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const baseRef = useRef('');

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no permite dictado por voz aquí. Escribe la nota.');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = getBase().trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      let finalTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTxt += t + ' ';
        else interim += t;
      }
      if (finalTxt) baseRef.current = (baseRef.current + ' ' + finalTxt).trim();
      onText((baseRef.current + ' ' + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function stop() {
    recRef.current?.stop();
  }

  return { listening, toggle, stop };
}
