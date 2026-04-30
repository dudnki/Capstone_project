import React, { useMemo, useState } from 'react';
import type { GeneratedSummary, EvaluationSummary, EvaluationRow, EvaluationRowStatus } from '../src/types';

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
  getScrollTop: () => number;
  restoreScrollTop: (top: number) => void;
}

const RESULT_EXTENSIONS = ['CSV'];

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
  getScrollTop,
  restoreScrollTop,
}: EvaluationResultProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | EvaluationRowStatus>('all');

  const hasResults = evaluationRows.length > 0;

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return evaluationRows;
    return evaluationRows.filter((row) => row.status === statusFilter);
  }, [evaluationRows, statusFilter]);

  const summaryCards = [
    {
      label: '질문 세트',
      value: generatedSummary ? `${generatedSummary.questionCount}개 준비` : '필요',
    },
    {
      label: '결과 CSV',
      value: resultFile ? '업로드됨' : '없음',
    },
    {
      label: '평가 상태',
      value: evaluationSummary ? '완료' : isEvaluating ? '진행 중' : '대기',
    },
  ];

  const metricPreviewCards = [
    {
      title: '답변 관련성',
      description: '답변이 질문 의도와 얼마나 관련성 있게 작성되었는지 확인합니다.',
    },
    {
      title: '답변 정확도',
      description: '답변 내용이 기준 문서와 비교해 얼마나 정확한지 확인합니다.',
    },
    {
      title: '답변 유사도',
      description: '답변이 기준 정답 또는 문서 기반 답변과 얼마나 유사한지 확인합니다.',
    },
  ];

  const formatScore = (score: number) => score.toFixed(2);

  const getScoreStyle = (score: number) => {
    if (score >= 0.85) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (score >= 0.7) return 'border-amber-100 bg-amber-50 text-amber-700';
    return 'border-rose-100 bg-rose-50 text-rose-700';
  };

  const getStatusLabel = (status: EvaluationRowStatus) => {
    if (status === 'good') return '양호';
    if (status === 'review') return '검토 필요';
    return '개선 필요';
  };

  const getStatusStyle = (status: EvaluationRowStatus) => {
    if (status === 'good') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (status === 'review') return 'border-amber-100 bg-amber-50 text-amber-700';
    return 'border-rose-100 bg-rose-50 text-rose-700';
  };

  const handleFilterChange = (nextFilter: 'all' | EvaluationRowStatus) => {
    const top = getScrollTop();
    setStatusFilter(nextFilter);
    restoreScrollTop(top);
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
                사용자 결과 CSV 파일을 업로드해 답변 품질을 한 화면에서 확인합니다.
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
                <h3 className="text-xl font-semibold text-slate-900">결과 CSV 업로드</h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  question / answer
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                질문 파일을 수행한 결과를 CSV 파일로 업로드하면 답변 관련성, 정확도, 유사도를 평가할 수 있습니다.
              </p>
            </div>

            <input
              ref={resultFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleResultFileChange}
            />

            <div
              className={`mt-4 flex min-h-[190px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-8 transition-colors ${
                isDraggingResult ? 'border-blue-300 bg-blue-50/70' : 'border-slate-300 bg-white'
              }`}
              onDragOver={handleResultDragOver}
              onDragLeave={handleResultDragLeave}
              onDrop={handleResultDrop}
            >
              {resultFile ? (
                <div className="flex w-full flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500">업로드된 결과 CSV</p>
                    <p className="mt-1 truncate text-xl font-semibold text-slate-900">{resultFile.name}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatFileSize(resultFile.size)}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[272px]">
                    <button
                      type="button"
                      onClick={() => resultFileInputRef.current?.click()}
                      className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                    >
                      파일 변경
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveResultFile}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-100"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">
                    평가할 결과 CSV를 선택하세요
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    question, answer 컬럼이 포함된 CSV 파일을 업로드하세요.
                    <br />
                    현재는 답변 품질 평가 중심으로 결과를 제공합니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => resultFileInputRef.current?.click()}
                    className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                  >
                    결과 CSV 선택
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
                {resultFile ? '평가 실행 준비가 완료되었습니다' : '결과 CSV를 업로드하면 상단에서 평가를 실행할 수 있습니다'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                종합 점수와 함께 답변 관련성, 답변 정확도, 답변 유사도를 확인합니다.
              </p>
            </div>

            {resultFile && (
              <button
                type="button"
                onClick={onRunEvaluation}
                disabled={isEvaluating}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  isEvaluating
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                    : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {isEvaluating ? '평가 실행 중...' : '평가 실행'}
              </button>
            )}
          </div>
        </div>
      </section>

      {!hasResults && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">평가 기준</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">평가 기준 미리보기</h3>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">제출 형식</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">결과 제출 CSV 예시</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              아래와 같은 컬럼 구조의 CSV 파일을 제출하면 평가에 사용할 수 있습니다.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-6 text-slate-700">{`question,answer
문서의 핵심 목적은 무엇인가요?,기준 문서를 바탕으로 질문 세트를 만들고 답변 품질을 평가합니다.
결과 제출 파일에는 어떤 항목이 필요한가요?,question과 answer 컬럼이 필요합니다.`}</pre>
          </div>
        </section>
      )}

      {evaluationSummary && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">종합 점수</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(evaluationSummary.overallScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변 품질을 종합한 평균 점수</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 관련성</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(evaluationSummary.answerRelevancyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변이 질문 의도와 얼마나 관련성 있는지 평가</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 정확도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(evaluationSummary.answerAccuracyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변 내용이 기준 문서와 비교해 얼마나 정확한지 평가</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 유사도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(evaluationSummary.answerSimilarityScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변이 기준 정답 또는 문서 기반 답변과 얼마나 유사한지 평가</p>
          </div>
        </section>
      )}

      {hasResults && (
        <section
          className="min-h-[980px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          style={{ overflowAnchor: 'none' }}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">평가 결과</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">질문별 상세 결과</h3>
              <p className="mt-1 text-sm text-slate-500">
                질문, 사용자 답변, 세부 점수와 상태를 한 번에 확인합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: '전체' },
                { key: 'good', label: '양호' },
                { key: 'review', label: '검토 필요' },
                { key: 'poor', label: '개선 필요' },
              ].map((item) => {
                const isActive = statusFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleFilterChange(item.key as 'all' | EvaluationRowStatus)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-[760px] divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <div key={row.id} className="px-6 py-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold text-blue-700">
                          {row.id}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(
                            row.status,
                          )}`}
                        >
                          {getStatusLabel(row.status)}
                        </span>
                      </div>
                      <h4 className="mt-3 text-sm font-semibold leading-6 text-slate-900">{row.question}</h4>
                    </div>

                    <div className="grid shrink-0 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">종합</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatScore(row.overallScore)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">답변 관련성</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatScore(row.answerRelevancyScore)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">답변 정확도</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatScore(row.answerAccuracyScore)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">답변 유사도</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatScore(row.answerSimilarityScore)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">사용자 답변</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{row.answer}</p>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getScoreStyle(
                        row.overallScore,
                      )}`}
                    >
                      최종 점수 {formatScore(row.overallScore)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {filteredRows.length === 0 && (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold text-slate-700">해당 상태의 결과가 없습니다.</p>
                <p className="mt-2 text-sm text-slate-500">필터를 변경해 다른 질문 결과를 확인해 보세요.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}