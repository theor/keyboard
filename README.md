# Clavier

A French keyboard web app for someone in intensive care who can't speak and has limited, imprecise use of one hand. Built for an Android tablet.

- **Phrase screen:** reached from the keyboard. Oui / Non and common needs, spoken aloud when picked.
- **Keyboard (start screen):** big A–Z keys (in ABC or AZERTY order) and word guessing. Guesses ignore accents, so typing `ete` offers `été`. After a space, the guesses show likely next words ("je veux" → que, voir…).
- **Group keyboard (setting):** 8 big keys (ABC, DEF…) around a space key. One touch per letter, and the word is guessed from the groups, as on old phones. *Épeler* brings back the A–Z keys for words it doesn't know.
- **Swipe keyboard (setting):** the same groups, picked by sliding from anywhere toward one, so the finger doesn't have to hit a key. A touch without a slide is a space.
- **Learning:** sentences that are spoken, shown or cleared teach the guesses this person's own words and habits. These stay on the tablet, and settings has a button to forget them.
- **Touch rules for an unsteady hand:** a key fires when the finger lifts, so the user can slide onto the right key. Only the first finger counts, and repeat taps are ignored for a set time.
- **Scanning mode:** rows, then keys, light up in turn. A touch anywhere picks.
- **Settings:** hold the ⚙ for 1.5 s. You can change sizes, timings, the voice, the phrases and personal words (names).

## Develop

```sh
npm install
npm run dev      # served on the local network too
npm test
npm run build    # output in dist/
```

## Put it on the tablet

The app works offline once it's loaded. To install it and keep the screen awake, it must be served over HTTPS. Any static host works (GitHub Pages, Netlify, Cloudflare Pages): upload `dist/`.

On the tablet:

1. Open the URL in Chrome, then use the menu › *Add to home screen*.
2. Check that a French voice is installed: Settings › Accessibility › Text-to-speech, then install the French (France) voice data so it works offline.
3. Turn on screen pinning so a stray touch can't leave the app: Settings › Security › App pinning.

## Word list

`src/data/words-fr.txt` holds the 20,000 most common French words, from [FrequencyWords](https://github.com/hermitdave/FrequencyWords), which is based on OpenSubtitles and so close to spoken French. To rebuild it:

```sh
node scripts/build-words.mjs path/to/fr_50k.txt
```

Hospital words are moved up the list. They're defined in `BOOST_WORDS` in `src/phrases.ts`.

## Next-word data

`src/data/next-fr.json` holds the likely next words after one or two words. It's counted from the French sentences of [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR), which are short, everyday sentences. To rebuild it, download `fra_sentences.tsv.bz2` from https://downloads.tatoeba.org/exports/per_language/fra/, unpack it, then run:

```sh
node scripts/build-nextwords.mjs path/to/fra_sentences.tsv
```
