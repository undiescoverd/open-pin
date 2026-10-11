import { formatTimecode } from '@waypost/core';
import { Button, Dialog, Icon, IconButton, cx, focusRing } from '@waypost/ui';
import { CornerLeftUp } from 'lucide-react';
import { useState } from 'react';
import { acceptReview, skipReview, type Choice } from '../capture/review';
import { useCapture, type Review } from '../capture/state';

/* After a recording with click capture: the steps its clicks suggest, to keep, merge into the one above, or drop. Add steps puts
   the kept ones in the guide (they are ordinary steps from then on); Skip, or Esc, keeps the recording and adds nothing. */

export function ClickReview() {
  const review = useCapture(s => s.review);
  return (
    <Dialog
      open={review !== null}
      onOpenChange={open => {
        if (!open) skipReview();
      }}
      title="Steps from your clicks"
      description="One for each click. Keep what you want; the rest can go."
      size="md"
    >
      {review && <Body review={review} />}
    </Dialog>
  );
}

function Body({ review }: { review: Review }) {
  const [choices, setChoices] = useState<Choice[]>(() => review.steps.map(step => ({ keep: true, merge: false, title: step.title })));
  const change = (i: number, patch: Partial<Choice>) => setChoices(list => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const kept = choices.filter(c => c.keep && !c.merge).length + choices.filter((c, i) => c.keep && c.merge && !choices.slice(0, i).some(p => p.keep)).length;
  /* a row can merge into the one above only if some kept row is above it */
  const canMerge = (i: number) => choices.slice(0, i).some(c => c.keep);
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Proposed steps" className="m-0 flex max-h-[50vh] list-none flex-col gap-1.5 overflow-auto p-0">
        {review.steps.map((step, i) => {
          const choice = choices[i]!;
          const merged = choice.keep && choice.merge && canMerge(i);
          return (
            <li key={i} className={cx('flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1.5', !choice.keep && 'opacity-60')}>
              <input
                type="checkbox"
                aria-label={`Keep step ${i + 1}`}
                checked={choice.keep}
                onChange={e => change(i, { keep: e.target.checked })}
                className={cx('size-4 shrink-0 accent-[var(--wp-sel)]', focusRing)}
              />
              <span className="w-12 shrink-0 font-mono text-sm text-fg-muted">{formatTimecode(step.time).replace(/\.\d+$/, '')}</span>
              {merged ? (
                <span className="min-w-0 flex-1 truncate text-fg-muted">{choice.title || step.label || 'Click'}, shown with the step above</span>
              ) : (
                <input
                  type="text"
                  aria-label={`Step ${i + 1} title`}
                  value={choice.title}
                  placeholder="Untitled step"
                  disabled={!choice.keep}
                  maxLength={120}
                  onChange={e => change(i, { title: e.target.value })}
                  className={cx('h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-panel px-2 text-base text-fg placeholder:text-fg-muted disabled:text-fg-disabled', focusRing)}
                />
              )}
              <IconButton
                label={`Merge step ${i + 1} into the step above`}
                size="sm"
                icon={<Icon icon={CornerLeftUp} />}
                pressed={merged}
                disabled={!choice.keep || !canMerge(i)}
                onClick={() => change(i, { merge: !choice.merge })}
              />
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={skipReview}>
          Skip, I'll add my own
        </Button>
        <Button variant="primary" disabled={kept === 0} onClick={() => acceptReview(review, choices)}>
          Add steps
        </Button>
      </div>
    </div>
  );
}
