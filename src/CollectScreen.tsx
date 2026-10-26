import { useEffect, useState } from 'preact/hooks';
import { type LetterReader, loadLetterReader } from './handwriting';
import { promptOrder, samples } from './samples';
import { Key, WritingPad } from './screens';

// Asks for letters one at a time and keeps each drawing, labelled, to retrain
// the letter reader on this person's hand. Opened from the settings.
export function CollectScreen(props: { pauseMs: number; onClose: () => void }) {
  const [reader, setReader] = useState<LetterReader>();
  const [queue, setQueue] = useState(promptOrder);
  // The last letter written here, and what the reader made of it.
  const [last, setLast] = useState<{ letter: string; reading: string }>();
  const [full, setFull] = useState(false);
  const [, setCount] = useState(samples.count());
  useEffect(() => {
    loadLetterReader().then(setReader);
  }, []);

  const target = queue[0];
  const next = () => setQueue(queue.length > 1 ? queue.slice(1) : promptOrder());

  return (
    <div class="screen collect">
      <div class="bar">
        <div class="text">
          Écrivez <b class="target">{target.toUpperCase()} ou {target}</b>
          <div class="collect-info">
            {last && (
              <span>
                {last.letter.toUpperCase()} lu {last.reading[0].toUpperCase()}
                {last.reading[0] === last.letter ? ' ✓' : ' ✗'} ·{' '}
              </span>
            )}
            {full ? 'Mémoire pleine : exportez puis effacez les lettres.' : `${samples.count()} lettre(s) gardée(s)`}
          </div>
        </div>
        <Key
          class="bar-key"
          label="↶ Refaire"
          disabled={!last}
          onPress={() => {
            samples.removeLast();
            samples.save();
            setQueue([last!.letter, ...queue]);
            setLast(undefined);
            setCount(samples.count());
          }}
        />
        <Key class="bar-key" label="Passer" onPress={next} />
        <Key class="bar-key" label="Terminer" onPress={props.onClose} />
      </div>
      <div class="write">
        <WritingPad
          pauseMs={props.pauseMs}
          hint={`Écrivez ${target.toUpperCase()}`}
          onLetter={(strokes) => {
            if (!reader) return;
            const reading = reader.read(strokes);
            if (!samples.add(target, 'prompt', reading, strokes)) return setFull(true);
            samples.save();
            setLast({ letter: target, reading });
            setCount(samples.count());
            next();
          }}
        />
      </div>
    </div>
  );
}
