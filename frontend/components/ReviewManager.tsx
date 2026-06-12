import React, { useState } from 'react';
import type { QuestionItem } from '../src/types';

interface ReviewManagerProps {
  questions: QuestionItem[];
  onUpdateQuestion: (id: string, text: string) => void;
  onRemoveQuestion: (id: string) => void;
}

export default function ReviewManager({
  questions,
  onUpdateQuestion,
  onRemoveQuestion,
}: ReviewManagerProps) {
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">질문 검토</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">질문 검토 및 수정</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {questions.length}개 질문
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {questions.map((question, index) => {
          const isEditing = editingQuestionId === question.id;

          return (
            <div key={question.id} className="px-6 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <textarea
                        value={question.text}
                        onChange={(event) => onUpdateQuestion(question.id, event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none focus:border-blue-400"
                      />
                    ) : (
                      <p className="text-sm leading-7 text-slate-700">{question.text}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 pl-10 xl:pl-0">
                  <button
                    type="button"
                    onClick={() => setEditingQuestionId(isEditing ? null : question.id)}
                    className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                  >
                    {isEditing ? '완료' : '수정'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveQuestion(question.id)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-100"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
