# Clavier

A French keyboard web app for someone in intensive care who can't speak and has limited, imprecise use of one hand. Built for an Android tablet.

- **Phrase screen:** reached from the keyboard. Oui / Non and common needs, spoken aloud when picked.
- **Keyboard (start screen):** big A–Z keys (in ABC or AZERTY order) and word guessing. Guesses ignore accents, so typing `ete` offers `été`. After a space, the guesses show likely next words ("je veux" → que, voir…).
- **Group keyboard (setting):** 8 big keys (ABC, DEF…) around a space key. One touch per letter, and the word is guessed from the groups, as on old phones. *Épeler* brings back the A–Z keys for words it doesn't know.
- **Swipe keyboard (setting):** the same groups, picked by sliding from anywhere toward one, so the finger doesn't have to hit a key. A touch without a slide is a space.
- **Handwriting (setting):** write one letter at a time with a finger. Each letter is read on the tablet, offline, by a small neural network, and its 4 likeliest readings feed the word guess, so a badly read letter still leads to the right word.
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

## Handwriting model

The handwriting keyboard reads one letter at a time with a small neural network. Everything runs on the tablet, offline, with no extra library.

### How a letter is read

1. **Drawing:** the pad (`WritingPad` in `src/screens.tsx`) records the strokes. The letter is read once the finger has stayed up for the pause set in settings.
2. **Image:** `rasterize()` in `src/handwriting.ts` turns the strokes into a 28×28 image, white on black, made the same way as EMNIST letters. The letter is centered, scaled to fill a 24×24 box while keeping its shape, and drawn with a soft pen about 2 px wide. The size the patient writes at doesn't matter.
3. **Network:** `LetterReader` runs the network in plain TypeScript and returns the 4 likeliest letters, best first, such as `"ilt"`.
4. **Word:** `Predictor.suggestLetters()` in `src/words.ts` finds words that fit those readings. Words that use only first readings come first. Each step down a reading costs one, up to 3, so one or two misread letters still lead to the right word.

### The network

| Layer | Output |
| --- | --- |
| Input | 1 × 28 × 28 |
| 3×3 convolution, ReLU, 2×2 max pooling | 32 × 14 × 14 |
| 3×3 convolution, ReLU, 2×2 max pooling | 64 × 7 × 7 |
| 3×3 convolution, ReLU, 2×2 max pooling | 64 × 3 × 3 |
| Dense, ReLU | 128 |
| Dense | 26 scores, a to z |

That's about 133,000 weights. `src/data/letters.bin` holds them as float32, little-endian, in the order PyTorch lists them (`conv1.weight`, `conv1.bias`, … `fc2.bias`). `SHAPES` in `src/handwriting.ts` must match `Net` in `scripts/train-letters.py`, and the reader throws if the file has the wrong size.

### Training

`scripts/train-letters.py` trains on [EMNIST](https://www.nist.gov/itl/products-and-services/emnist-dataset) letters: 124,800 training images and 20,800 test images. Capitals and small letters share one class each (A and a are both `a`), which suits the word guesser because it ignores case.

- **Shaky writing:** each batch is changed at random. Letters are rotated up to 15°, slanted, moved, scaled from 80% to 110%, and their strokes are made thicker or thinner.
- **Setup:** AdamW, a one-cycle learning rate up to 0.004, batch size 256, 12 epochs, and label smoothing of 0.05. It takes a few minutes on an Apple Silicon Mac (MPS).
- **Results:** 94.5% of test letters are read right first, and 99.5% are among the first three readings.

To retrain it (this downloads EMNIST, about 560 MB, into the given folder):

```sh
python3 -m venv venv && venv/bin/pip install torch torchvision
venv/bin/python scripts/train-letters.py path/to/emnist
```

It prints the test scores after each epoch and overwrites `src/data/letters.bin`. Then run `npm test`. `src/handwriting.test.ts` draws every letter as strokes, plain and shaky, and checks that it's read. It also checks that the image has about as much ink as EMNIST letters (the training script prints EMNIST's mean, 0.17).

### Limits

- It reads one letter at a time, not whole words.
- EMNIST has no accents. If the patient writes `é`, it may be misread, so it's better to write `e` and let the word guesser add the accent.
- It doesn't learn the patient's own hand.
