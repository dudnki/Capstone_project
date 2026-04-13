import React from 'react';

type GeneratedSummary = {
  questionCount: number;
  format: 'csv' | 'json';
  createdAt: string;
};

type EvaluationSummary = {
  retrievalScore: number;
  answerScore: number;
  groundedScore: number;
};

type EvaluationRow = {
  id: number;
  question: string;
  answer: string;
  retrievedContext: string;
  score: number;
};

interface EvaluationResultProps {
  isEvaluating: boolean;
  resultFile: File | null;
  generatedSummary: GeneratedSummary | null;
  evaluationSummary: EvaluationSummary | null;
  evaluationRows: EvaluationRow[];
  resultFileInputRef: React.RefObject<HTMLInputElement | null>;
  isDraggingResult: boolean;
  handleResultDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveResultFile: () => void;
  onRunEvaluation: () => void;
  formatFileSize: (bytes: number) => string;
}

const RESULT_EXTENSIONS = ['CSV', 'JSON', 'JSONL'];

export default function EvaluationResult({
  isEvaluating,
  resultFile,
  generatedSummary,
  evaluationSummary,
  evaluationRows,
  resultFileInputRef,
  isDraggingResult,
  handleResultDragOver,
  handleResultDragLeave,
  handleResultDrop,
  handleResultFileChange,
  onRemoveResultFile,
  onRunEvaluation,
  formatFileSize,
}: EvaluationResultProps) {
  const formatScore = (score: number) => score.toFixed(2);

  const getScoreStyle = (score: number) => {
    if (score >= 0.8) return 'text-blue-700 bg-blue-50 border-blue-100';
    if (score >= 0.6) return 'text-amber-700 bg-amber-50 border-amber-100';
    return 'text-rose-700 bg-rose-50 border-rose-100';
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Evaluation</p>
              <h2 className="mt-2 text-[30px] font-bold tracking-tight text-slate-900">성능 평가</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                사용자 결과 파일을 업로드해 검색 성능과 생성 성능을 함께 확인합니다.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-medium text-slate-500">질문 세트</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{generatedSummary ? '준비됨' : '필요'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-medium text-slate-500">결과 파일</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{resultFile ? '업로드됨' : '없음'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-medium text-slate-500">평가 상태</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {evaluationSummary ? '완료' : isEvaluating ? '진행 중' : '대기'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">결과 파일 업로드</h3>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    question / answer / retrieved_context
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">질문 파일에 대한 사용자 시스템 결과를 업로드하세요.</p>
              </div>

              <input
                ref={resultFileInputRef}
                type="file"
                accept=".csv,.json,.jsonl"
                className="hidden"
                onChange={handleResultFileChange}
              />

              <div
                className={`rounded-lg border border-dashed px-5 py-5 transition-colors ${
                  isDraggingResult ? 'border-blue-300 bg-blue-50/70' : 'border-slate-300 bg-white'
                }`}
                onDragOver={handleResultDragOver}
                onDragLeave={handleResultDragLeave}
                onDrop={handleResultDrop}
              >
                {resultFile ? (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">업로드된 결과 파일</p>
                      <p className="mt-1 truncate text-base font-semibold text-slate-900">{resultFile.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatFileSize(resultFile.size)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => resultFileInputRef.current?.click()}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        파일 변경
                      </button>
                      <button
                        type="button"
                        onClick={onRemoveResultFile}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                      >
                        제거
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <p className="text-base font-semibold text-slate-900">평가할 결과 파일을 선택하세요</p>
                    <p className="mt-1 text-sm text-slate-500">CSV, JSON, JSONL 형식을 지원합니다.</p>
                    <button
                      type="button"
                      onClick={() => resultFileInputRef.current?.click()}
                      className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      결과 파일 선택
                    </button>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {RESULT_EXTENSIONS.map((ext) => (
                        <span key={ext} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
                          {ext}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {resultFile ? '평가 실행 준비 완료' : '결과 파일 업로드 후 평가를 실행하세요'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">retrieved_context를 포함해야 검색 성능과 생성 성능을 함께 볼 수 있습니다.</p>
                </div>

                <button
                  type="button"
                  onClick={onRunEvaluation}
                  disabled={!resultFile || isEvaluating}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                    !resultFile || isEvaluating
                      ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isEvaluating ? '평가 실행 중...' : '평가 실행하기'}
                </button>
              </div>
            </div>
          </div>

          <aside className="w-full shrink-0 bg-slate-50 p-5 lg:w-[288px]">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">평가 조건</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">질문 세트</span>
                    <span className="text-xs font-semibold text-slate-900">{generatedSummary ? '완료' : '필요'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">결과 파일</span>
                    <span className="text-xs font-semibold text-slate-900">{resultFile ? '완료' : '필요'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">필수 필드</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['question', 'answer', 'retrieved_context'].map((field) => (
                    <span key={field} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              {evaluationSummary && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-semibold text-blue-700">평가 요약</p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-900">검색 성능</span>
                      <span className="font-semibold text-blue-900">{formatScore(evaluationSummary.retrievalScore)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-900">생성 성능</span>
                      <span className="font-semibold text-blue-900">{formatScore(evaluationSummary.answerScore)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-900">근거 일치도</span>
                      <span className="font-semibold text-blue-900">{formatScore(evaluationSummary.groundedScore)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {evaluationRows.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Result</p>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">상세 결과</h3>
            <p className="text-sm text-slate-500">문항별 질문, 답변, 근거 문맥, 점수를 확인합니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">질문</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">답변</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">retrieved_context</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">점수</th>
                </tr>
              </thead>
              <tbody>
                {evaluationRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-5 py-4 text-sm leading-6 text-slate-700">{row.question}</td>
                    <td className="px-5 py-4 text-sm leading-6 text-slate-600">{row.answer}</td>
                    <td className="px-5 py-4 text-sm leading-6 text-slate-600">{row.retrievedContext}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getScoreStyle(row.score)}`}>
                        {row.score.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
