const isFrench = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-').startsWith('fr');
const isFrance = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-') === 'fr-fr';

export function frenchVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter(isFrench);
}

export function speak(text: string, rate: number, voiceURI: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = rate;
  const voices = frenchVoices();
  const voice =
    voices.find((v) => v.voiceURI === voiceURI) ??
    voices.find((v) => isFrance(v) && v.localService) ??
    voices.find(isFrance) ??
    voices[0];
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

export function onVoicesChanged(fn: () => void): () => void {
  if (!('speechSynthesis' in window)) return () => {};
  speechSynthesis.addEventListener('voiceschanged', fn);
  return () => speechSynthesis.removeEventListener('voiceschanged', fn);
}
