import React, { useMemo } from 'react';
import type { QuestionItem, GeneratedSummary } from '../src/types';

interface DatasetManagerProps {
  isGenerating: boolean;
  uploadedFile: File | null;
  generatedSummary: GeneratedSummary | null;
  generatedQuestions: QuestionItem[];
  hasDownloadedQuestionSet: boolean;
  currentStep: number;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatFileSize: (bytes: number) => string;
  onRemoveFile: () => void;
  onGenerateQuestions: () => void;
  onQuestionTextChange: (questionId: string, nextText: string) => void;
  onRemoveQuestion: (questionId: string) => void;
  onDownloadQuestions: () => void;
  onMoveToEvaluation: () => void;
}

const DOCUMENT_EXTENSIONS = ['PDF'];
const STEPS = ['문서 업로드', '질문 생성', '질문 검토/수정', 'CSV 다운로드'];

const GUIDE_STEPS = [
  {
    title: '원본 PDF 업로드',
    description: '평가 기준이 되는 원본 PDF 문서를 올립니다.',
  },
  {
    title: '질문 세트 생성',
    description: '문서 내용을 바탕으로 평가에 사용할 질문과 qa_id를 생성합니다.',
  },
  {
    title: '질문 검토/수정',
    description: '생성된 질문을 같은 화면에서 확인하고 필요한 문구를 다듬습니다.',
  },
  {
    title: 'CSV 다운로드',
    description: 'qa_id를 유지한 질문 파일을 내려받아 answer 컬럼을 채웁니다.',
  },
];

export default function DatasetManager({
  isGenerating,
  uploadedFile,
  generatedSummary,
  generatedQuestions,
  hasDownloadedQuestionSet,
  currentStep,
  isDragging,
  fileInputRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileChange,
  formatFileSize,
  onRemoveFile,
  onGenerateQuestions,
  onQuestionTextChange,
  onRemoveQuestion,
  onDownloadQuestions,
  onMoveToEvaluation,
}: DatasetManagerProps) {
  const hasQuestions = generatedQuestions.length > 0;
  const safeStep = Math.min(currentStep, STEPS.length);

  const workflowState = useMemo(() => {
    if (!uploadedFile) return '먼저 원본 PDF 문서를 업로드하세요.';
    if (!generatedSummary) return '문서가 준비되었습니다. 질문 생성하기를 눌러 테스트셋을 만드세요.';
    if (!hasDownloadedQuestionSet) return '질문을 검토한 뒤 qa_id가 포함된 CSV로 다운로드하세요.';
    return '질문 CSV 다운로드가 완료되었습니다. answer 컬럼을 채운 뒤 성능 평가 단계로 이동할 수 있습니다.';
  }, [uploadedFile, generatedSummary, hasDownloadedQuestionSet]);

  return (
    <div className="flex w-full flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                테스트셋 생성
              </p>
              <h2 className="mt-1.5 text-[26px] font-bold tracking-tight text-slate-950">
                문서 기반 질문 세트 만들기
              </h2>
              <p className="mt-1.5 text-[15px] leading-6 text-slate-500">
                원본 PDF를 업로드하고 질문을 생성한 뒤, 같은 화면에서 검토/수정하고 CSV로 내려받습니다.
              </p>
            </div>

            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>현재 단계</span>
                <span className="font-semibold text-blue-700">
                  {safeStep} / {STEPS.length}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {STEPS.map((step, index) => (
                  <div key={step} className="min-w-0">
                    <div
                      className={`h-1.5 rounded-full ${
                        index + 1 <= safeStep ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    />
                    <p
                      className={`mt-2 truncate text-[11px] font-medium ${
                        index + 1 === safeStep ? 'text-blue-700' : 'text-slate-400'
                      }`}
                    >
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">원본 PDF 업로드</h3>
                <p className="mt-1 text-[15px] leading-6 text-slate-500">
                  원본 PDF를 기준으로 평가 질문과 qa_id를 생성합니다.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {isGenerating ? '질문 생성 중' : uploadedFile ? '업로드 완료' : 'PDF 필요'}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <div
              className={`mt-4 flex min-h-[200px] flex-col justify-center rounded-2xl border border-dashed px-6 transition-colors ${
                isDragging ? 'border-blue-300 bg-blue-50' : 'border-slate-300 bg-white'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploadedFile ? (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">선택된 원본 PDF</p>
                    <p className="mt-1 truncate text-2xl font-semibold text-slate-950">
                      {uploadedFile.name}
                    </p>
                    <p className="mt-2 text-[15px] text-slate-500">{formatFileSize(uploadedFile.size)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!hasQuestions && (
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={onGenerateQuestions}
                        className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
                          isGenerating
                            ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                            : 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700'
                        }`}
                      >
                        {isGenerating ? '질문 생성 중...' : '질문 생성하기'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      문서 변경
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveFile}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-2xl text-center">
                  <p className="text-xl font-semibold tracking-tight text-slate-950">
                    원본 PDF를 이곳에 놓거나 선택하세요
                  </p>
                  <p className="mt-2 text-[14px] leading-6 text-slate-500">
                    문서를 선택하면 같은 카드 안에서 질문 세트를 생성할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition-colors hover:bg-blue-700"
                  >
                    PDF 선택
                  </button>
                  <div className="mt-3 flex justify-center gap-2">
                    {DOCUMENT_EXTENSIONS.map((ext) => (
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

          <aside className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">현재 할 일</h3>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">{workflowState}</p>

            <div className="mt-4 space-y-2.5">
              {GUIDE_STEPS.map((item, index) => {
                const isDone = index + 1 < safeStep;
                const isActive = index + 1 === safeStep;

                return (
                  <div key={item.title} className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-700'
                          : isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      {hasQuestions ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-7 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                질문 검토/수정
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                생성된 질문을 확인하세요
              </h3>
              <p className="mt-1 text-[15px] leading-7 text-slate-500">
                질문 검토는 테스트셋 생성 흐름에 포함됩니다. 질문 문구를 수정해도 qa_id는 유지됩니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {generatedQuestions.length}개 질문
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  hasDownloadedQuestionSet
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-amber-100 bg-amber-50 text-amber-700'
                }`}
              >
                {hasDownloadedQuestionSet ? '다운로드 완료' : '다운로드 필요'}
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {generatedQuestions.map((question, index) => (
              <div key={question.id} className="grid gap-5 px-7 py-5 lg:grid-cols-[112px_minmax(0,1fr)_auto]">
                <div>
                  <p className="text-xs font-semibold text-slate-400">QUESTION</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">{String(index + 1).padStart(2, '0')}</p>
                  <p className="mt-2 max-w-[96px] truncate text-[11px] text-slate-400">{question.id}</p>
                </div>

                <label className="block">
                  <span className="sr-only">{index + 1}번째 질문</span>
                  <textarea
                    value={question.text}
                    onChange={(e) => onQuestionTextChange(question.id, e.target.value)}
                    rows={2}
                    className="min-h-[96px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-7 text-slate-800 outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => onRemoveQuestion(question.id)}
                  className="h-fit rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 border-t border-slate-100 bg-slate-50 px-7 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-950">다음 단계</p>
              <p className="mt-1 text-[15px] leading-7 text-slate-500">
                질문 CSV를 내려받은 뒤, qa_id는 유지하고 answer 컬럼에 사용자 RAG 시스템 답변을 채워 업로드하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownloadQuestions}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                질문 CSV 다운로드
              </button>
              <button
                type="button"
                onClick={onMoveToEvaluation}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              >
                성능 평가로 이동
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              빈 상태 안내
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-slate-950">질문 세트가 아직 없습니다</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {GUIDE_STEPS.map((item, index) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <span className="text-xs font-bold text-blue-700">STEP {index + 1}</span>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              제출 파일 예시
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-slate-950">결과 파일은 이렇게 준비합니다</h3>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">
              질문 파일을 사용자의 RAG 시스템에서 실행한 뒤, qa_id를 유지하고 answer 컬럼을 채워 업로드합니다.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-6 text-slate-700">{`qa_id,question,answer
생성된 qa_id,문서의 핵심 목적은 무엇인가요?,사용자 RAG 시스템 답변`}</pre>
          </div>
        </section>
      )}
    </div>
  );
}
