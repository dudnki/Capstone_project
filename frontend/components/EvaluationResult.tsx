import React, { useMemo, useState } from 'react';
import type {
  EvalMode,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
} from '../src/types';

interface EvaluationResultProps {
  evalMode: EvalMode;
  isEvaluating: boolean;
  resultFile: File | null;
  evaluationSummary: EvaluationSummary | null;
  evaluationRows: EvaluationRow[];
  evaluationProgress: number;
  evaluationElapsedSeconds: number;
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

const safeNum = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) || v == null ? 0 : n;
};

const getRowScores = (row: EvaluationRow) => {
  const nested = (row as any).scores ?? {};
  return {
    overall: safeNum(
      (row as any).avg_score ??
      (row as any).overallScore
    ),
    faithfulness: safeNum(
      nested.faithfulness ??
      (row as any).faithfulness
    ),
    relevancy: safeNum(
      nested.answer_relevancy ??
      (row as any).answer_relevancy ??
      (row as any).questionFitScore
    ),
    correctness: safeNum(
      nested.answer_correctness ??
      (row as any).answer_correctness ??
      (row as any).accuracyScore
    ),
  };
};

const deriveStatus = (avgScore: number): EvaluationRowStatus => {
  if (avgScore >= 0.85) return 'good';
  if (avgScore >= 0.7)  return 'review';
  return 'poor';
};

const getSummaryScores = (s: EvaluationSummary) => ({
  overall:      safeNum((s as any).overallAvgScore   ?? (s as any).overallScore),
  faithfulness: safeNum((s as any).faithfulness),
  relevancy:    safeNum((s as any).answerRelevancy   ?? (s as any).questionFitScore),
  correctness:  safeNum((s as any).answerCorrectness ?? (s as any).accuracyScore),
});

const normalizeFeedbackText = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text
    .replaceAll('학생의 답변은', '제출 답변은')
    .replaceAll('학생 답변은', '제출 답변은')
    .replaceAll('학생은', '제출 답변은')
    .replaceAll('학생이', '제출 답변이')
    .replaceAll('학생의 답변', '제출 답변')
    .replaceAll('학생 답변', '제출 답변')
    .replaceAll('학생의', '제출 답변의')
    .replaceAll('학생에게', '학습자에게')
    .replaceAll('학생', '학습자');
};

const parseAdviceSteps = (value: unknown) => {
  const text = normalizeFeedbackText(value);
  if (!text) return [];

  const matches = [...text.matchAll(/(\d+단계)\s*[:：]?\s*([\s\S]*?)(?=\s*\d+단계\s*[:：]?|$)/g)];

  if (matches.length === 0) {
    return [{ label: '조언', body: text }];
  }

  return matches
    .map((match) => ({
      label: match[1],
      body: match[2].trim(),
    }))
    .filter((item) => item.body.length > 0);
};

export default function EvaluationResult({
  evalMode,
  isEvaluating,
  resultFile,
  evaluationSummary,
  evaluationRows,
  evaluationProgress,
  evaluationElapsedSeconds,
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
  const currentStep = !resultFile ? 1 : !evaluationSummary ? 2 : 3;
  const steps = ['결과 CSV 업로드', '평가 실행', '결과 확인'];
  const stepProgress = evaluationSummary ? steps.length + 1 : currentStep;
  const visibleStep = Math.min(stepProgress, steps.length);

  const csvUploadIcon = (
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-[0_10px_24px_rgba(37,99,235,0.08)]">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    </div>
  );

  const rowsWithStatus = useMemo(
    () =>
      evaluationRows.map((row) => {
        const scores = getRowScores(row);
        const status: EvaluationRowStatus =
          (row as any).status ?? deriveStatus(scores.overall);
        return { ...row, _scores: scores, _status: status };
      }),
    [evaluationRows],
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rowsWithStatus;
    return rowsWithStatus.filter((row) => row._status === statusFilter);
  }, [rowsWithStatus, statusFilter]);
  const stableResultListMinHeight = Math.max(
    720,
    rowsWithStatus.length * (evalMode === 'user' ? 460 : 260),
  );

  const formatScore = (score: unknown): string => safeNum(score).toFixed(2);

  const getScoreStyle = (score: unknown): string => {
    const s = safeNum(score);
    if (s >= 0.85) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (s >= 0.7)  return 'border-amber-100 bg-amber-50 text-amber-700';
    return 'border-rose-100 bg-rose-50 text-rose-700';
  };

  const getStatusLabel = (status: EvaluationRowStatus) => {
    if (status === 'good')   return '양호';
    if (status === 'review') return '검토 필요';
    return '개선 필요';
  };

  const getStatusStyle = (status: EvaluationRowStatus) => {
    if (status === 'good')   return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    if (status === 'review') return 'border-amber-100 bg-amber-50 text-amber-700';
    return 'border-rose-100 bg-rose-50 text-rose-700';
  };

  const handleFilterChange = (nextFilter: 'all' | EvaluationRowStatus) => {
    const top = getScrollTop();
    setStatusFilter(nextFilter);
    restoreScrollTop(top);
  };

  const summaryScores = evaluationSummary ? getSummaryScores(evaluationSummary) : null;
  const overallFeedback = (evaluationSummary as any)?.overallFeedback;
  const overallDirectionSteps = parseAdviceSteps(overallFeedback?.direction);

  const metricPreviewCards = [
    {
      title: '종합',
      description: '관련성, 정확도, 유사도를 종합해 전체 답변 품질을 확인합니다.',
    },
    {
      title: '관련성',
      description: '답변이 질문 의도에 맞게 작성되었는지 확인합니다.',
    },
    {
      title: '정확도',
      description: '답변 내용이 기준 문서와 비교해 정확한지 확인합니다.',
    },
    {
      title: '유사도',
      description: '답변이 기준 문서 기반 기대 답변과 얼마나 유사한지 확인합니다.',
    },
  ];


  return (
    <div className="flex h-full flex-col gap-4">
      {/* 상단 업로드 섹션 */}
      <section
        className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${
          hasResults ? '' : 'flex-1 lg:h-[680px] 2xl:h-[700px]'
        }`}
      >
        <div className="flex-shrink-0 border-b border-blue-100 bg-blue-50/40 px-6 py-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              Evaluation
            </p>
            <h2 className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">성능 평가</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              결과 CSV를 업로드해 답변 품질을 한 화면에서 확인합니다.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-slate-900">
                  {evalMode === 'user' ? '답안지 CSV 제출' : '결과 CSV 업로드'}
                </h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  qa_id / 답변
                </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {evalMode === 'user'
                    ? '다운로드한 답변 작성용 CSV에 답변을 채워 제출하면 채점 결과를 확인할 수 있습니다.'
                    : '다운로드한 질문 CSV를 RAG/챗봇에 실행한 뒤 답변 컬럼을 채워 업로드합니다.'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(37,99,235,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">진행 단계</p>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                  {visibleStep} / {steps.length}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className={`rounded-xl border px-3 py-2.5 ${
                      index + 1 < stepProgress
                        ? 'border-emerald-100 bg-emerald-50/70'
                        : index + 1 === stepProgress
                          ? 'border-blue-300 bg-blue-50/70 shadow-[0_8px_20px_rgba(37,99,235,0.10)]'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          index + 1 < stepProgress
                            ? 'bg-emerald-500 text-white'
                            : index + 1 === stepProgress
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {index + 1 < stepProgress ? '✓' : index + 1}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          index + 1 <= stepProgress ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                    <p
                      className={`mt-1.5 text-[11px] ${
                        index + 1 === stepProgress
                          ? 'font-semibold text-blue-700'
                          : index + 1 < stepProgress
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {index + 1 < stepProgress ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          완료
                        </span>
                      ) : index + 1 === stepProgress ? (
                        '현재 단계'
                      ) : (
                        '대기'
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <input
              ref={resultFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleResultFileChange}
            />

            <div className="mt-4 grid flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div
                className={`flex min-h-[310px] flex-col items-center justify-center rounded-2xl border border-dashed px-8 transition-colors ${
                  isDraggingResult
                      ? 'border-blue-300 bg-blue-50/70'
                      : 'border-slate-300 bg-white'
                }`}
                onDragOver={handleResultDragOver}
                onDragLeave={handleResultDragLeave}
                onDrop={handleResultDrop}
              >
                {resultFile ? (
                  <div className="flex w-full flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-500">업로드된 결과 CSV</p>
                      <p className="mt-1 truncate text-2xl font-semibold text-slate-900">
                        {resultFile.name}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {formatFileSize(resultFile.size)}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[272px]">
                      <button
                        type="button"
                        onClick={() => resultFileInputRef.current?.click()}
                        className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                      >
                        CSV 변경
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
                    {csvUploadIcon}
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">
                      평가할 결과 CSV를 업로드하세요
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      번호, qa_id, 질문, 답변 형식의 CSV 파일을 업로드합니다.
                      <br />
                      qa_id는 그대로 유지하고 답변 컬럼만 채워 주세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => resultFileInputRef.current?.click()}
                      className="mt-6 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                    >
                      CSV 선택
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

              <aside className="grid min-h-[310px] min-w-0 grid-rows-2 gap-3">
                <div className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                    제출 CSV 형식
                  </p>
                  <p className="mt-3 text-sm font-semibold text-slate-900">필수 컬럼</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      qa_id
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      답변
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    qa_id는 그대로 유지하고, 답변만 입력합니다.
                  </p>
                </div>

                <div className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                    업로드 전 확인
                  </p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span>CSV 파일만 업로드할 수 있습니다.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span>qa_id는 다운로드한 값 그대로 유지합니다.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span>답변 컬럼에는 평가할 답변만 입력합니다.</span>
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>

          <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {resultFile
                  ? '평가 실행 준비가 완료되었습니다'
                  : '결과 파일을 업로드하면 상단에서 평가를 실행할 수 있습니다'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                qa_id와 답변을 기준으로 관련성, 정확도, 유사도를 함께 확인합니다.
              </p>
              {isEvaluating && (
                <div className="mt-4 max-w-xl rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-blue-700">
                    <span>평가 진행 중</span>
                    <span>{evaluationProgress}% · {evaluationElapsedSeconds}초</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${evaluationProgress}%` }}
                    />
                  </div>
                </div>
              )}
              {!isEvaluating && evaluationSummary && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  평가 완료 · {evaluationElapsedSeconds}초 소요
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 평가 기준 미리보기 (결과 없을 때) */}
      {!hasResults && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="min-h-[208px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              평가 기준
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">평가 기준 미리보기</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {metricPreviewCards.map((item) => (
                <div
                  key={item.title}
                  className="min-h-[108px] rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-[208px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              제출 형식
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">결과 제출 파일 예시</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              qa_id와 답변이 포함된 CSV를 제출하면 평가에 사용할 수 있습니다.
            </p>
            <pre className="mt-4 min-h-[72px] overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-6 text-slate-700">{`번호,qa_id,질문,답변
1,qa_001,문서의 핵심 목적은 무엇인가요?,사용자 RAG 시스템 답변`}</pre>
          </div>
        </section>
      )}

      {/* 평가 요약 카드 */}
      {evaluationSummary && summaryScores && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">종합</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(summaryScores.overall)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변 품질을 종합한 평균 점수</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">관련성</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(summaryScores.relevancy)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변이 질문 의도와 얼마나 관련 있는지 평가</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">정확도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(summaryScores.correctness)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변 내용이 기준 문서와 비교해 정확한지 평가</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-xs text-slate-500">유사도</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatScore(summaryScores.faithfulness)}
            </p>
            <p className="mt-2 text-xs text-slate-500">답변이 기준 문서 기반 기대 답변과 유사한지 평가</p>
          </div>
        </section>
      )}

      {/* 종합 피드백 (사용자 평가 모드) */}
      {evalMode === 'user' && overallFeedback && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">잘한 점</p>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              {normalizeFeedbackText(overallFeedback.strengths)}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">학습 방향</p>
            <div className="mt-3 grid gap-2">
              {overallDirectionSteps.map((item) => (
                <div
                  key={`overall-${item.label}`}
                  className="rounded-xl border border-amber-100 bg-white/70 p-3"
                >
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    {item.label}
                  </span>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 질문별 상세 결과 */}
      {hasResults && (
        <section
          className="min-h-[760px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          style={{ minHeight: stableResultListMinHeight + 80, overflowAnchor: 'none' }}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                평가 결과
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                {evalMode === 'user' ? '문제별 상세 결과' : '질문별 상세 결과'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                질문, 사용자 답변, 세부 점수와 상태를 한 번에 확인합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'all',    label: '전체' },
                  { key: 'good',   label: '양호' },
                  { key: 'review', label: '검토 필요' },
                  { key: 'poor',   label: '개선 필요' },
                ] as const
              ).map((item) => {
                const isActive = statusFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleFilterChange(item.key)}
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

          <div className="divide-y divide-slate-100" style={{ minHeight: stableResultListMinHeight }}>
            {filteredRows.map((row, idx) => {
              const rowKey   = (row as any).qa_id ?? (row as any).id ?? idx;
              const rowLabel = (row as any).qa_id ?? (row as any).id ?? idx + 1;
              const scores   = row._scores;
              const status   = row._status;
              const adviceSteps = parseAdviceSteps((row as any).feedback?.advice);

              return (
                <div key={String(rowKey)} className="px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold text-blue-700">
                            {String(rowLabel).length > 8
                              ? `${String(rowLabel).slice(0, 8)}...`
                              : rowLabel}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(status)}`}
                          >
                            {getStatusLabel(status)}
                          </span>
                        </div>
                        <h4 className="mt-3 text-sm font-semibold leading-6 text-slate-900">
                          {(row as any).question}
                        </h4>
                      </div>

                      <div className="grid shrink-0 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] text-slate-500">종합</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatScore(scores.overall)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] text-slate-500">관련성</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatScore(scores.relevancy)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] text-slate-500">정확도</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatScore(scores.correctness)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] text-slate-500">유사도</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatScore(scores.faithfulness)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500">제출 답변</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">
                        {(row as any).answer}
                      </p>
                    </div>

                    {evalMode === 'user' && (row as any).feedback && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-slate-500">채점 근거</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {normalizeFeedbackText((row as any).feedback.reasoning)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                          <p className="text-xs font-semibold text-amber-600">개선 방향</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {normalizeFeedbackText((row as any).feedback.improvements)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                          <p className="text-xs font-semibold text-blue-600">학습 방향</p>
                          <div className="mt-3 space-y-2">
                            {adviceSteps.map((item) => (
                              <div
                                key={`${String(rowKey)}-${item.label}`}
                                className="rounded-xl border border-blue-100 bg-white/75 p-3"
                              >
                                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                  {item.label}
                                </span>
                                <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {evalMode !== 'user' && (row as any).score_reasons && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-slate-500">질문 이해도 근거</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {(row as any).score_reasons.answer_relevancy || '-'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-slate-500">내용 완성도 근거</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {(row as any).score_reasons.answer_correctness || '-'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-slate-500">문서 일치도 근거</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {(row as any).score_reasons.faithfulness || '-'}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getScoreStyle(scores.overall)}`}
                      >
                        최종 점수 {formatScore(scores.overall)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredRows.length === 0 && (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  해당 상태의 결과가 없습니다.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  필터를 변경해 다른 질문 결과를 확인해 보세요.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
