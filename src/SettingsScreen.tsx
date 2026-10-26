import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { frenchVoices, onVoicesChanged, speak } from './speech';

type NumberKey = 'scanMs' | 'debounceMs' | 'minHoldMs' | 'fontSize' | 'rate';

export function SettingsScreen(props: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  learnedCount: number;
  onForget: () => void;
}) {
  const s = props.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => props.onChange({ ...s, [k]: v });

  const [voices, setVoices] = useState(frenchVoices);
  useEffect(() => onVoicesChanged(() => setVoices(frenchVoices())), []);

  const range = (k: NumberKey, label: string, min: number, max: number, step: number, unit = '') => (
    <label class="field">
      <span>
        {label} : <b>{s[k]}{unit}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[k]}
        onInput={(e) => set(k, Number(e.currentTarget.value))}
      />
    </label>
  );

  return (
    <div class="settings" data-native="">
      <header>
        <h1>Réglages</h1>
        <button type="button" class="btn primary" onClick={props.onClose}>
          Retour
        </button>
      </header>

      <section>
        <h2>Toucher</h2>
        {range('fontSize', 'Taille du texte', 20, 80, 2, ' px')}
        {range('debounceMs', 'Ignorer les touches répétées pendant', 0, 1500, 50, ' ms')}
        {range('minHoldMs', 'Durée minimale d’appui', 0, 1000, 50, ' ms')}
        <p class="hint">
          Une touche est choisie quand le doigt se lève : on peut glisser vers la bonne touche avant
          de lâcher.
        </p>
      </section>

      <section>
        <h2>Balayage</h2>
        <label class="check">
          <input type="checkbox" checked={s.scanning} onChange={(e) => set('scanning', e.currentTarget.checked)} />
          Mode balayage (toucher n’importe où pour choisir)
        </label>
        {range('scanMs', 'Vitesse du balayage', 500, 4000, 100, ' ms')}
      </section>

      <section>
        <h2>Voix</h2>
        <label class="check">
          <input type="checkbox" checked={s.speech} onChange={(e) => set('speech', e.currentTarget.checked)} />
          Lire le texte à voix haute
        </label>
        <label class="field">
          <span>Voix</span>
          <select value={s.voiceURI} onChange={(e) => set('voiceURI', e.currentTarget.value)}>
            <option value="">Automatique (français)</option>
            {voices.map((v) => (
              <option value={v.voiceURI}>
                {v.name} ({v.lang}){v.localService ? '' : ' – en ligne'}
              </option>
            ))}
          </select>
        </label>
        {range('rate', 'Vitesse de la voix', 0.5, 1.5, 0.05)}
        <button type="button" class="btn" onClick={() => speak('Bonjour, je vais bien.', s.rate, s.voiceURI)}>
          Tester la voix
        </button>
        {voices.length === 0 && (
          <p class="hint">
            Aucune voix française trouvée. Sur Android : Paramètres › Accessibilité › Synthèse vocale,
            puis installer le français.
          </p>
        )}
      </section>

      <section>
        <h2>Affichage</h2>
        <label class="check">
          <input
            type="checkbox"
            checked={s.theme === 'light'}
            onChange={(e) => set('theme', e.currentTarget.checked ? 'light' : 'dark')}
          />
          Thème clair
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={s.speech && s.showSpeak}
            disabled={!s.speech}
            onChange={(e) => set('showSpeak', e.currentTarget.checked)}
          />
          Afficher le bouton « Parler »{!s.speech && ' (voix coupée)'}
        </label>
        <label class="check">
          <input type="checkbox" checked={s.showShow} onChange={(e) => set('showShow', e.currentTarget.checked)} />
          Afficher le bouton « Montrer »
        </label>
      </section>

      <section>
        <h2>Phrases (une par ligne)</h2>
        <textarea rows={10} value={s.phrases} onInput={(e) => set('phrases', e.currentTarget.value)} />
      </section>

      <section>
        <h2>Mots personnels (une par ligne)</h2>
        <p class="hint">Prénoms, lieux, mots de la famille : ils sont proposés en premier.</p>
        <textarea rows={6} value={s.personalWords} onInput={(e) => set('personalWords', e.currentTarget.value)} />
      </section>

      <section>
        <h2>Mots appris</h2>
        <p class="hint">
          Les phrases lues, montrées ou effacées servent à mieux deviner le mot suivant.{' '}
          {props.learnedCount} mot(s) appris.
        </p>
        <button
          type="button"
          class="btn"
          onClick={() => confirm('Oublier tous les mots appris ?') && props.onForget()}
        >
          Oublier les mots appris
        </button>
      </section>

      <section>
        <button
          type="button"
          class="btn danger"
          onClick={() => confirm('Remettre tous les réglages par défaut ?') && props.onChange(DEFAULT_SETTINGS)}
        >
          Réglages par défaut
        </button>
      </section>
    </div>
  );
}
