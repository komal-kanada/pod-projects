"use client";

/** The provided sample questions as one-tap chips. */
export function SampleQuestions({
  questions,
  onPick,
  disabled,
}: {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  if (questions.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="eyebrow mb-2">Try a sample question</p>
      <ul className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <li key={question} className="max-w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(question)}
              className="press border-hairline bg-surface hover:bg-surface-2 max-w-full truncate rounded-full border px-3.5 py-1.5 text-left text-[0.8125rem] transition-colors duration-150 disabled:opacity-50"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
