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
  formatFileSize: (bytes: number) => string;
  getScrollTop: () => number;
  restoreScrollTop: (top: number) => void;
}

const RESULT_EXTENSIONS = ['CSV'];
const REQUIRED_COLUMNS = ['question', 'answer'];

const METRIC_GUIDES = [
  {
    title: '종합 점수',
    description: '관련성, 정확도, 유사도를 종합해 전체 답변 품질을 한눈에 확인합니다.',
  },
  {
    title: '답변 관련성',
    description: '질문 의도에 맞게 답변했는지 확인합니다.',
  },
  {
    title: '답변 정확도',
    description: '기준 문서의 내용과 충돌하지 않는지 확인합니다.',
  },
  {
    title: '답변 유사도',
    description: '문서 기반 기대 답변과 의미가 얼마나 가까운지 확인합니다.',
  },
];

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
  formatFileSize,
  getScrollTop,
  restoreScrollTop,
}: EvaluationResultProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | EvaluationRowStatus>('all');

  const hasResults = evaluationRows.length > 0;
  const hasQuestionSet = Boolean(generatedSummary);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return evaluationRows;
    return evaluationRows.filter((row) => row.status === statusFilter);
  }, [evaluationRows, statusFilter]);

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
    <div className="flex w-full flex-col gap-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-100 px-7 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                성능 평가
              </p>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-slate-950">
                RAG 결과 파일 평가하기
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-slate-500">
                생성된 질문을 사용자의 RAG 시스템에서 실행한 뒤, question과 answer가 포함된 CSV를 업로드합니다.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[480px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <p className="text-xs font-medium text-slate-500">질문 세트</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {generatedSummary ? `${generatedSummary.questionCount}개 준비` : '먼저 생성 필요'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <p className="text-xs font-medium text-slate-500">결과 CSV</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {resultFile ? '업로드 완료' : '대기'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                <p className="text-xs font-medium text-slate-500">평가 상태</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {evaluationSummary ? '완료' : isEvaluating ? '진행 중' : '대기'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-7 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">결과 CSV 업로드</h3>
                <p className="mt-1 text-[15px] leading-7 text-slate-500">
                  질문 파일을 실행한 결과를 업로드하세요. 기본 컬럼은 question과 answer입니다.
                </p>
              </div>
              <span
                className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  hasQuestionSet
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-amber-100 bg-amber-50 text-amber-700'
                }`}
              >
                {hasQuestionSet ? '질문 세트 준비됨' : '질문 세트 필요'}
              </span>
            </div>

            <input
              ref={resultFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleResultFileChange}
            />

            <div
              className={`mt-5 flex min-h-[260px] flex-col justify-center rounded-2xl border border-dashed px-8 transition-colors ${
                isDraggingResult ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-white'
              }`}
              onDragOver={handleResultDragOver}
              onDragLeave={handleResultDragLeave}
              onDrop={handleResultDrop}
            >
              {resultFile ? (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">업로드된 결과 파일</p>
                    <p className="mt-1 truncate text-2xl font-semibold text-slate-950">{resultFile.name}</p>
                    <p className="mt-2 text-[15px] text-slate-500">{formatFileSize(resultFile.size)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resultFileInputRef.current?.click()}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      파일 변경
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveResultFile}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-2xl text-center">
                  <p className="text-2xl font-semibold tracking-tight text-slate-950">
                    평가할 결과 CSV를 업로드하세요
                  </p>
                  <p className="mt-2 text-[15px] leading-7 text-slate-500">
                    질문 파일을 사용자의 RAG 시스템에서 실행한 뒤, question과 answer 컬럼을 채워 업로드합니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => resultFileInputRef.current?.click()}
                    className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition-colors hover:bg-blue-700"
                  >
                    결과 CSV 선택
                  </button>
                  <div className="mt-4 flex justify-center gap-2">
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

            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <p className="text-[15px] font-semibold text-slate-950">
                  {resultFile ? '평가 실행 준비가 완료되었습니다' : 'CSV를 업로드하면 상단에서 평가를 실행할 수 있습니다'}
                </p>
                <p className="mt-1 text-[15px] leading-7 text-slate-500">
                  질문 세트와 결과 CSV가 준비되면 우측 상단의 평가 실행하기 버튼으로 평가를 시작합니다.
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-semibold text-slate-950">CSV 포맷</h3>
            <p className="mt-2 text-[15px] leading-7 text-slate-500">
              기본 제출 파일은 question과 answer 컬럼 중심으로 준비합니다.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">필수 컬럼</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REQUIRED_COLUMNS.map((column) => (
                    <span
                      key={column}
                      className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                    >
                      {column}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">업로드 기준</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  다운로드한 질문을 실행한 결과를 question과 answer 컬럼으로 정리합니다.
                </p>
              </div>
            </div>

            <pre className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-6 text-slate-700">{`question,answer
문서의 핵심 목적은 무엇인가요?,문서 기반 질문 생성과 답변 품질 평가입니다.`}</pre>
          </aside>
        </div>
      </section>

      {!hasResults && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              평가 기준
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">결과에서 확인할 항목</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {METRIC_GUIDES.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              사용 순서
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">평가 실행 전 확인</h3>
            <div className="mt-5 space-y-3">
              {['테스트셋 생성에서 질문 CSV 다운로드', '사용자 RAG 시스템에서 질문별 답변 생성', 'question, answer CSV 업로드 후 평가 실행'].map(
                (item, index) => (
                  <div key={item} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {evaluationSummary && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">종합 점수</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.overallScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">전체 답변 품질 평균</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 관련성</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.answerRelevancyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">질문 의도와의 관련성</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 정확도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.answerAccuracyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">기준 문서 기반 정확성</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">답변 유사도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.answerSimilarityScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">기대 답변과의 의미 유사성</p>
          </div>
        </section>
      )}

      {hasResults && (
        <section
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]"
          style={{ overflowAnchor: 'none' }}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                평가 결과
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">질문별 상세 결과</h3>
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

          <div className="divide-y divide-slate-100">
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
                      <h4 className="mt-3 text-sm font-semibold leading-6 text-slate-950">{row.question}</h4>
                    </div>

                    <div className="grid shrink-0 gap-2 sm:grid-cols-4">
                      {[
                        { label: '종합', score: row.overallScore },
                        { label: '관련성', score: row.answerRelevancyScore },
                        { label: '정확도', score: row.answerAccuracyScore },
                        { label: '유사도', score: row.answerSimilarityScore },
                      ].map((metric) => (
                        <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] text-slate-500">{metric.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">
                            {formatScore(metric.score)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
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
