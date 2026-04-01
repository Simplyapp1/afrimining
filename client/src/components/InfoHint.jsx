import { useState } from 'react';

export default function InfoHint({ title = 'How it works', text, bullets = [] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-6 w-6 rounded-full border border-surface-300 text-surface-600 text-xs font-semibold hover:bg-surface-100"
        aria-label={title}
        title={title}
      >
        i
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-surface-200 bg-surface-50 p-3 max-w-2xl text-left">
          {text && <p className="text-sm text-surface-700">{text}</p>}
          {bullets.length > 0 && (
            <ul className="text-sm text-surface-700 space-y-1 list-disc ml-5 mt-2">
              {bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
