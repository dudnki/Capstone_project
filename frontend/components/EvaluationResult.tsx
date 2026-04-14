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
  const hasResults = evaluationRows.length > 0;

  const summaryCards = [
    {
      label: '질문 세트',
      value: generatedSummary ? '준비됨' : '필요',
    },
    {
      label: '결과 파일',
      value: resultFile ? '업로드됨' : '없음',
    },
    {
      label: '평가 상태',
      value: evaluationSummary ? '완료' : isEvaluating ? '진행 중' : '대기',
    },
  ];

  const metricPreviewCards = [
    {
      title: 'Faithfulness',
      description: '답변이 retrieved_context에 근거하고 있는지 평가합니다.',
    },
    {
      title: 'Answer Relevancy',
      description: '답변이 질문 의도와 얼마나 잘 맞는지 평가합니다.',
    },
    {
      title: 'Answer Correctness',
      description: '정답성과 근거 일치도를 함께 확인합니다.',
    },
  ];

  const formatScore = (score: number) => score.toFixed(2);

  const getScoreStyle = (score: number) => {
    if (score >= 0.8) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (score >= 0.6) return 'border-amber-100 bg-amber-50 text-amber-700';
    return 'border-rose-100 bg-rose-50 text-rose-700';
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <section
        className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${
          hasResults ? '' : 'flex-1'
        }`}
      >
        <div className="flex-shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Evaluation</p>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">성능 평가</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                사용자 결과 파일을 업로드해 검색 성능과 생성 성능을 한 화면에서 함께 확인합니다.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[372px]">
              {summaryCards.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-slate-900">결과 파일 업로드</h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  question / answer / retrieved_context
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                질문 파일을 수행한 결과를 업로드하면 검색 및 생성 성능을 평가할 수 있습니다.
              </p>
            </div>

            <input
              ref={resultFileInputRef}
              type="file"
              accept=".csv,.json,.jsonl"
              className="hidden"
              onChange={handleResultFileChange}
            />

            <div
              className={`mt-4 flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-8 transition-colors ${
                isDraggingResult ? 'border-blue-300 bg-blue-50/70' : 'border-slate-300 bg-white'
              }`}
              onDragOver={handleResultDragOver}
              onDragLeave={handleResultDragLeave}
              onDrop={handleResultDrop}
            >
              {resultFile ? (
                <div className="flex w-full flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500">업로드된 결과 파일</p>
                    <p className="mt-1 truncate text-xl font-semibold text-slate-900">{resultFile.name}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatFileSize(resultFile.size)}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[240px]">
                    <button
                      type="button"
                      onClick={() => resultFileInputRef.current?.click()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      파일 변경
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveResultFile}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">
                    평가할 결과 파일을 선택하세요
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    question, answer, retrieved_context 필드를 포함한 결과 파일을 업로드하세요.
                    <br />
                    파일을 끌어다 놓거나 아래 버튼을 눌러 선택할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => resultFileInputRef.current?.click()}
                    className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                  >
                    결과 파일 선택
                  </button>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {RESULT_EXTENSIONS.map((ext) => (
                      <span
                        key={ext}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500"
                      >
                        {ext}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {resultFile ? '평가 실행 준비가 완료되었습니다' : '결과 파일을 업로드하면 평가를 실행할 수 있습니다'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                retrieved_context가 있어야 검색 성능과 생성 성능을 함께 비교할 수 있습니다.
              </p>
            </div>

            <button
              type="button"
              onClick={onRunEvaluation}
              disabled={!resultFile || isEvaluating}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                !resultFile || isEvaluating
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.16)] hover:bg-blue-700'
              }`}
            >
              {isEvaluating ? '평가 실행 중...' : '평가 실행하기'}
            </button>
          </div>
        </div>
      </section>

      {!hasResults && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Metric Preview</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">평가 지표 미리보기</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {metricPreviewCards.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Sample Format</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">결과 제출 파일 예시</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              아래와 같은 구조의 파일을 제출하면 평가에 사용할 수 있습니다.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-5 text-slate-700">{`{
  "question": "...",
  "answer": "...",
  "retrieved_context": "..."
}`}</pre>
          </div>
        </section>
      )}

      {evaluationSummary && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">검색 성능</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {formatScore(evaluationSummary.retrievalScore)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">생성 성능</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {formatScore(evaluationSummary.answerScore)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">근거 일치도</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {formatScore(evaluationSummary.groundedScore)}
              </p>
            </div>
          </div>
        </section>
      )}

      {hasResults && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Result</p>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">상세 결과</h3>
            <p className="text-sm text-slate-500">질문, 답변, 근거 문맥, 점수를 한 번에 확인합니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">질문</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">답변</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">retrieved_context</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">점수</th>
                </tr>
              </thead>
              <tbody>
                {evaluationRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-6 py-4 text-sm leading-7 text-slate-700">{row.question}</td>
                    <td className="px-6 py-4 text-sm leading-7 text-slate-600">{row.answer}</td>
                    <td className="px-6 py-4 text-sm leading-7 text-slate-600">{row.retrievedContext}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getScoreStyle(
                          row.score,
                        )}`}
                      >
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