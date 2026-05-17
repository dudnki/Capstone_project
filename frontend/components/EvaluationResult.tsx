import React, { useMemo, useState } from 'react';
import type {
  EvaluationMode,
  GeneratedSummary,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
} from '../src/types';

interface EvaluationResultProps {
  isEvaluating: boolean;
  resultFile: File | null;
  generatedSummary: GeneratedSummary | null;
  evaluationMode: EvaluationMode;
  evaluationSummary: EvaluationSummary | null;
  evaluationRows: EvaluationRow[];
  resultFileInputRef: React.RefObject<HTMLInputElement | null>;
  isDraggingResult: boolean;
  handleResultDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleResultFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEvaluationModeChange: (mode: EvaluationMode) => void;
  onRunEvaluation: () => void;
  onMoveToDataset: () => void;
  onRemoveResultFile: () => void;
  canRunEvaluation: boolean;
  formatFileSize: (bytes: number) => string;
  getScrollTop: () => number;
  restoreScrollTop: (top: number) => void;
}

const RESULT_EXTENSIONS = ['CSV'];
const REQUIRED_COLUMNS = ['qa_id', 'answer'];

const EVALUATION_MODE_OPTIONS: Array<{
  key: EvaluationMode;
  title: string;
  description: string;
  helper: string;
  uploadTitle: string;
  emptyTitle: string;
  buttonLabel: string;
  formatDescription: string;
  uploadStandard: string;
  flowStep: string;
  exampleAnswer: string;
  statLabel: string;
}> = [
  {
    key: 'chatbot',
    title: 'RAG/챗봇 답변',
    description: '질문 CSV를 RAG 또는 챗봇에 실행해 생성한 답변을 평가합니다.',
    helper: '다운로드한 qa_id를 유지하고 answer 컬럼에 챗봇 답변을 채웁니다.',
    uploadTitle: '챗봇 답변 CSV 업로드',
    emptyTitle: '평가할 챗봇 답변 CSV를 업로드하세요',
    buttonLabel: '챗봇 답변 CSV 선택',
    formatDescription: '챗봇이 생성한 답변을 qa_id와 answer 컬럼으로 정리합니다.',
    uploadStandard: '질문 CSV를 RAG/챗봇에서 실행한 뒤, qa_id는 그대로 두고 answer만 채워 업로드합니다.',
    flowStep: 'RAG/챗봇에서 질문별 답변을 생성하고 answer 컬럼에 입력',
    exampleAnswer: '사용자 RAG/챗봇 답변',
    statLabel: '챗봇 답변',
  },
  {
    key: 'resultFile',
    title: '별도 결과/정답 파일',
    description: '정답지, 계산 결과, 다른 시스템 출력처럼 파일로 보유한 답변을 평가합니다.',
    helper: '문항별 qa_id에 맞춰 answer 컬럼에 결과값 또는 정답을 입력합니다.',
    uploadTitle: '결과/정답 CSV 업로드',
    emptyTitle: '평가할 결과 CSV를 업로드하세요',
    buttonLabel: '결과 CSV 선택',
    formatDescription: '별도 결과 파일의 값을 qa_id와 answer 컬럼으로 정리합니다.',
    uploadStandard: '기존 파일의 문항을 qa_id에 맞춘 뒤, 평가할 값은 answer 컬럼에 넣어 업로드합니다.',
    flowStep: '별도 결과 파일의 문항별 값이나 정답을 answer 컬럼으로 정리',
    exampleAnswer: '별도 결과 파일의 답변/정답',
    statLabel: '결과 파일',
  },
];

const METRIC_GUIDES = [
  {
    title: '종합',
    description: '관련성, 정확도, 유사도를 종합해 전체 답변 품질을 한눈에 확인합니다.',
  },
  {
    title: '관련성',
    description: '답변이 질문 의도와 얼마나 관련성 있게 작성되었는지 확인합니다.',
  },
  {
    title: '정확도',
    description: '답변이 기준 문서와 비교해 얼마나 정확한지 확인합니다.',
  },
  {
    title: '유사도',
    description: '답변이 문서 기반 기대 답변과 얼마나 유사한지 확인합니다.',
  },
];

export default function EvaluationResult({
  isEvaluating,
  resultFile,
  generatedSummary,
  evaluationMode,
  evaluationSummary,
  evaluationRows,
  resultFileInputRef,
  isDraggingResult,
  handleResultDragOver,
  handleResultDragLeave,
  handleResultDrop,
  handleResultFileChange,
  onEvaluationModeChange,
  onRunEvaluation,
  onMoveToDataset,
  onRemoveResultFile,
  canRunEvaluation,
  formatFileSize,
  getScrollTop,
  restoreScrollTop,
}: EvaluationResultProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | EvaluationRowStatus>('all');

  const hasResults = evaluationRows.length > 0;
  const hasQuestionSet = Boolean(generatedSummary);
  const selectedMode =
    EVALUATION_MODE_OPTIONS.find((option) => option.key === evaluationMode) ?? EVALUATION_MODE_OPTIONS[0];

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
    <div className="flex w-full flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                성능 평가
              </p>
              <h2 className="mt-1.5 text-[26px] font-bold tracking-tight text-slate-950">
                답변 결과 CSV 평가하기
              </h2>
              <p className="mt-1.5 text-[15px] leading-6 text-slate-500">
                {selectedMode.description} 제출 파일은 CSV 형식이며 qa_id와 answer 컬럼을 기준으로 평가합니다.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3 xl:min-w-[500px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">질문 세트</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {generatedSummary ? `${generatedSummary.questionCount}개 준비` : '먼저 생성 필요'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">평가 대상</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {selectedMode.statLabel}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">평가 상태</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-950">
                  {evaluationSummary ? '완료' : isEvaluating ? '진행 중' : '대기'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">평가 방식 선택</h3>
                <p className="mt-1 text-[15px] leading-6 text-slate-500">
                  평가하려는 데이터가 챗봇 답변인지, 별도 결과/정답 파일인지 먼저 선택하세요.
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

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {EVALUATION_MODE_OPTIONS.map((option) => {
                const isActive = evaluationMode === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onEvaluationModeChange(option.key)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      isActive
                        ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-[0_10px_24px_rgba(37,99,235,0.08)]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold">{option.title}</p>
                          {isActive && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              선택됨
                            </span>
                          )}
                        </div>
                        <p className={`mt-1 text-sm leading-6 ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
                          {option.description}
                        </p>
                      </div>
                      <span
                        className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border ${
                          isActive ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                        }`}
                      />
                    </div>
                    <p className={`mt-3 text-xs leading-5 ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
                      {option.helper}
                    </p>
                  </button>
                );
              })}
            </div>

            {!hasQuestionSet && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">먼저 질문 세트를 생성해야 합니다</p>
                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      성능 평가는 테스트셋 생성에서 만들어진 qa_id와 document_id를 기준으로 실행됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onMoveToDataset}
                    className="w-fit rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                  >
                    테스트셋 생성으로 이동
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {selectedMode.uploadTitle}
                </h3>
                <p className="mt-1 text-[14px] leading-6 text-slate-500">
                  {selectedMode.uploadStandard}
                </p>
              </div>
            </div>

            <input
              ref={resultFileInputRef}
              type="file"
              accept=".csv"
              disabled={!hasQuestionSet}
              className="hidden"
              onChange={handleResultFileChange}
            />

            <div
              className={`mt-4 flex min-h-[170px] flex-col justify-center rounded-2xl border border-dashed px-6 transition-colors ${
                !hasQuestionSet
                  ? 'border-slate-200 bg-slate-100/70'
                  : isDraggingResult
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-300 bg-white'
              }`}
              onDragOver={hasQuestionSet ? handleResultDragOver : undefined}
              onDragLeave={hasQuestionSet ? handleResultDragLeave : undefined}
              onDrop={hasQuestionSet ? handleResultDrop : undefined}
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
                      disabled={!canRunEvaluation || isEvaluating}
                      onClick={onRunEvaluation}
                      className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
                        canRunEvaluation && !isEvaluating
                          ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700'
                          : 'cursor-not-allowed bg-slate-200 text-slate-400'
                      }`}
                    >
                      {isEvaluating ? '평가 실행 중...' : '평가 실행하기'}
                    </button>
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
                  <p className="text-xl font-semibold tracking-tight text-slate-950">
                    {hasQuestionSet ? selectedMode.emptyTitle : '질문 세트 생성 후 결과 CSV를 업로드하세요'}
                  </p>
                  <p className="mt-2 text-[14px] leading-6 text-slate-500">
                    {hasQuestionSet
                      ? 'CSV만 지원하며, qa_id와 answer 컬럼이 반드시 포함되어야 합니다.'
                      : '먼저 원본 PDF로 질문 세트를 생성해야 평가용 qa_id가 준비됩니다.'}
                  </p>
                  <button
                    type="button"
                    onClick={hasQuestionSet ? () => resultFileInputRef.current?.click() : onMoveToDataset}
                    className={`mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${
                      hasQuestionSet
                        ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700'
                        : 'border border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    {hasQuestionSet ? selectedMode.buttonLabel : '테스트셋 생성으로 이동'}
                  </button>
                  {hasQuestionSet && (
                    <div className="mt-3 flex justify-center gap-2">
                      {RESULT_EXTENSIONS.map((ext) => (
                        <span
                          key={ext}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500"
                        >
                          {ext}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {resultFile
                    ? canRunEvaluation
                      ? '평가 실행 준비가 완료되었습니다'
                      : '먼저 테스트셋 생성에서 질문 세트를 만들어야 합니다'
                    : '결과 파일을 업로드하면 평가 실행 버튼이 나타납니다'}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {resultFile
                    ? canRunEvaluation
                      ? '업로드한 CSV가 준비되었습니다. 같은 카드 안의 평가 실행하기 버튼으로 시작하세요.'
                      : '질문 생성이 완료되어 document_id와 qa_id가 준비되어야 평가를 실행할 수 있습니다.'
                    : '질문 세트와 제출 CSV가 준비되면 업로드 카드 안에서 바로 평가를 실행합니다.'}
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-950">제출 CSV 포맷</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                CSV만 지원
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">
              {selectedMode.formatDescription}
            </p>

            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
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

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-semibold text-slate-500">업로드 기준</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedMode.uploadStandard}
                </p>
              </div>
            </div>

            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-6 text-slate-700">{`qa_id,answer
생성된 qa_id,${selectedMode.exampleAnswer}`}</pre>
          </aside>
        </div>
      </section>

      {!hasResults && (
        <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              평가 기준
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-slate-950">결과에서 확인할 항목</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {METRIC_GUIDES.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-5 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              사용 순서
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-slate-950">평가 실행 전 확인</h3>
            <div className="mt-4 space-y-2.5">
              {[
                '테스트셋 생성에서 qa_id가 포함된 질문 CSV 다운로드',
                selectedMode.flowStep,
                'qa_id와 answer가 포함된 CSV 업로드 후 평가 실행',
              ].map(
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
            <p className="text-xs text-slate-500">종합</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.overallScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">전체 답변 품질 평균</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">관련성</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.answerRelevancyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">질문 의도와의 관련성</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">정확도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {formatScore(evaluationSummary.answerAccuracyScore)}
            </p>
            <p className="mt-2 text-xs text-slate-500">기준 문서 기반 정확성</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">유사도</p>
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
                          {row.id.length > 8 ? `${row.id.slice(0, 8)}...` : row.id}
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
