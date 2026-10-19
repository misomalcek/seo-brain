/**
 * Voice utilities — Web Speech API (STT + TTS)
 * Free, browser-native, no API keys needed.
 */

// STT — Speech-to-Text
export function isSTTSupported(): boolean {
  return typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function startListening(
  onResult: (text: string) => void,
  onEnd: () => void,
  lang = 'sk-SK'
): any {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;

  const recognition = new SR();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const transcript = event.results?.[0]?.[0]?.transcript;
    if (transcript) onResult(transcript);
  };

  recognition.onend = onEnd;
  recognition.onerror = () => onEnd();

  recognition.start();
  return recognition;
}

// TTS — Text-to-Speech
export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

// Strip markdown for cleaner speech
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '')        // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`(.+?)`/g, '$1')       // inline code
    .replace(/```[\s\S]*?```/g, '')   // code blocks
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/[|─┌┐└┘├┤┬┴┼]/g, '')  // table chars
    .replace(/\n{3,}/g, '\n\n')      // excess newlines
    .trim();
}

export function speak(text: string, onEnd?: () => void): void {
  if (!isTTSSupported()) return;

  window.speechSynthesis.cancel(); // stop any current speech

  const cleaned = stripMarkdown(text);
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = 'sk-SK';
  utterance.rate = 1.0;

  // Try to find Slovak voice, fall back to default
  const voices = window.speechSynthesis.getVoices();
  const skVoice = voices.find(v => v.lang.startsWith('sk'));
  if (skVoice) utterance.voice = skVoice;

  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isTTSSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  return isTTSSupported() && window.speechSynthesis.speaking;
}
