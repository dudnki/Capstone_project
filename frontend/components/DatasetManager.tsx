import React from 'react';
import ReviewManager from './ReviewManager';
import type { QuestionItem, GeneratedSummary, EvalMode, GenerationLevel } from '../src/types';

interface DatasetManagerProps {
  evalMode?: EvalMode | null;
  generationLevel: GenerationLevel;
  isGenerating: boolean;
  uploadedFile: File | null;
  generatedSummary: GeneratedSummary | null;
  generatedQuestions: QuestionItem[];
  currentStep: number;
  generationProgress: number;
  generationElapsedSeconds: number;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatFileSize: (bytes: number) => string;
  onGenerationLevelChange: (level: GenerationLevel) => void;
  onRemoveFile: () => void;
  onGenerateQuestions: () => void;
  onDownloadQuestions: () => void;
  onMoveToEvaluation: () => void;
  onUpdateQuestion: (id: string, text: string) => void;
  onRemoveQuestion: (id: string) => void;
}

const DOCUMENT_EXTENSIONS = ['PDF'];
const GENERATION_LEVEL_OPTIONS: Array<{
  value: GenerationLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'low',
    label: '낮음',
    description: '핵심 사실 확인 중심으로 빠르게 생성합니다.',
  },
  {
    value: 'medium',
    label: '중간',
    description: '기본 평가에 적합한 균형 잡힌 질문을 생성합니다.',
  },
  {
    value: 'high',
    label: '높음',
    description: '문서 이해와 비교가 필요한 질문 비중을 높입니다.',
  },
];

export default function DatasetManager({
  evalMode,
  generationLevel,
  isGenerating,
  uploadedFile,
  generatedSummary,
  generatedQuestions,
  currentStep,
  generationProgress,
  generationElapsedSeconds,
  isDragging,
  fileInputRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileChange,
  formatFileSize,
  onGenerationLevelChange,
  onRemoveFile,
  onDownloadQuestions,
  onMoveToEvaluation,
  onUpdateQuestion,
  onRemoveQuestion,
}: DatasetManagerProps) {
  const isUserMode = evalMode === 'user';

  const hasQuestions = generatedQuestions.length > 0;
  const selectedGenerationLevel =
    GENERATION_LEVEL_OPTIONS.find((option) => option.value === generationLevel) ??
    GENERATION_LEVEL_OPTIONS[1];
  const STEPS = isUserMode
    ? ['문서 업로드', '문제 생성', '문제 검토', '문제 다운로드']
    : ['문서 업로드', '질문 생성', '질문 검토', '질문 다운로드'];
  const stepProgress = Math.min(currentStep, STEPS.length + 1);
  const visibleStep = Math.min(stepProgress, STEPS.length);

  const uploadIcon = (
    <div className="upload-bounce mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-[0_10px_24px_rgba(37,99,235,0.08)]">
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
        <path d="M12 18v-6" />
        <path d="m9 15 3-3 3 3" />
      </svg>
    </div>
  );

  const emptyGuideSteps = isUserMode
    ? [
        {
          step: '01',
          title: '기준 문서 업로드',
          description: '기준 PDF 문서를 업로드합니다.',
        },
        {
          step: '02',
          title: '문제 생성 수준 선택',
          description: '문제 난이도와 검토 강도에 맞는 생성 수준을 선택합니다.',
        },
        {
          step: '03',
          title: '문제 세트 생성',
          description: '문서를 기반으로 시험용 문제를 자동 생성합니다.',
        },
        {
          step: '04',
          title: '문제 검토 및 다운로드',
                  description: '생성된 문제를 수정·삭제한 뒤 답변 작성용 CSV로 내려받습니다.',
        },
      ]
    : [
        {
          step: '01',
          title: '기준 문서 업로드',
          description: '기준 PDF 문서를 업로드합니다.',
        },
        {
          step: '02',
          title: '질문 생성 수준 선택',
          description: '평가 목적에 맞게 질문 생성 수준을 선택합니다.',
        },
        {
          step: '03',
          title: '질문 세트 생성',
          description: '문서를 기반으로 평가용 질문 세트를 자동 생성합니다.',
        },
        {
          step: '04',
          title: '질문 검토 및 다운로드',
          description: '생성된 질문을 수정하거나 삭제한 뒤 CSV 파일로 내려받습니다.',
        },
      ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section
        className={`flex flex-col gap-4 ${hasQuestions ? '' : 'flex-1'}`}
      >
        <div className="flex-shrink-0 px-1 py-2">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Testset Builder</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 2xl:text-[28px]">테스트셋 생성</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              기준 문서를 업로드하고 질문을 생성한 뒤, 같은 화면에서 바로 검토하고 내려받습니다.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-1 flex-col gap-4">
            <div className="sr-only">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-slate-900">기준 문서 업로드</h3>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    PDF
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  업로드한 기준 PDF를 바탕으로 평가용 질문 세트를 생성합니다.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="sr-only">진행 단계</p>
                <span className="absolute right-3 top-3 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                  {visibleStep} / 4
                </span>
              </div>
              <div className="grid gap-2 p-2 sm:grid-cols-2 2xl:grid-cols-4">
                {STEPS.map((step, index) => (
                  <div
                    key={step}
                    className={`rounded-xl border px-4 py-4 ${
                      index + 1 < stepProgress
                        ? 'border-emerald-100 bg-emerald-50/60'
                        : index + 1 === stepProgress
                          ? 'border-blue-300 bg-blue-50/70'
                          : 'border-slate-200 bg-white'
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
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="mt-2 grid flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
                  <h3 className="text-xl font-semibold text-slate-900">기준 문서 업로드</h3>
                  <span className="ml-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    PDF
                  </span>
                </div>
              <div
                className={`m-4 flex min-h-[390px] flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-5 py-7 transition-colors md:min-h-[420px] 2xl:min-h-[470px] 2xl:px-8 ${
                  isDragging
                    ? 'border-blue-300 bg-blue-50/70'
                    : uploadedFile
                      ? 'border-slate-300 bg-white'
                      : 'border-slate-300 bg-white'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploadedFile ? (
                  <div className="flex w-full flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-500">선택된 문서</p>
                      <p className="mt-1 truncate text-2xl font-semibold text-slate-900">{uploadedFile.name}</p>
                      <p className="mt-2 text-sm text-slate-500">{formatFileSize(uploadedFile.size)}</p>
                    </div>

                    <div className={isGenerating ? 'flex justify-start xl:justify-end' : 'grid gap-2 sm:grid-cols-2 xl:min-w-[272px]'}>
                      {isGenerating ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-10 items-center rounded-full border border-blue-100 bg-blue-50 px-4 text-sm font-semibold text-blue-600 shadow-sm"
                        >
                          생성 중...
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                          >
                            문서 변경
                          </button>
                          <button
                            type="button"
                            onClick={onRemoveFile}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-100"
                          >
                            제거
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    {uploadIcon}
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">
                      업로드할 기준 PDF를 선택하세요
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      PDF 문서만 업로드할 수 있습니다.
                      <br />
                      파일을 끌어다 놓거나 아래 버튼을 눌러 선택하세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-6 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                    >
                      PDF 선택
                    </button>
                  </div>
                )}
              </div>
              </div>

              <aside className="grid min-h-[250px] min-w-0 gap-3 sm:grid-cols-2 xl:min-h-[280px] xl:grid-cols-1 2xl:min-h-[310px]">
                <div className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                  <div className="border-b border-slate-200 px-4 py-3.5">
                    <p className="text-sm font-bold text-slate-950">질문 생성 수준</p>
                  </div>
                  <div className="space-y-2 p-4">
                    {GENERATION_LEVEL_OPTIONS.map((option) => {
                      const isSelected = option.value === generationLevel;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onGenerationLevelChange(option.value)}
                          disabled={isGenerating}
                          className={`flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-bold transition-all ${
                            isSelected
                              ? 'border border-slate-300 bg-slate-100 text-blue-600 shadow-inner'
                              : 'border border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          <span>{option.label}</span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                    <p className="pt-1 text-xs leading-5 text-slate-500">
                    {selectedGenerationLevel.description}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">답변 작성용 CSV 예시</p>
                  </div>
                  <div className="p-4">
                    <pre className="overflow-x-auto rounded-lg bg-slate-50 px-3 py-3 text-[11px] leading-6 text-slate-700">{`번호,qa_id,질문,답변
1,qa_001,핵심 목적은?,
2,qa_002,주요 지표는?,
3,qa_003,...,`}</pre>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      qa_id와 질문은 유지하고, 답변 컬럼만 채워 제출합니다.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {uploadedFile
                  ? (isUserMode ? '문제 생성 준비가 완료되었습니다' : '질문 생성 준비가 완료되었습니다')
                  : (isUserMode ? '문서를 올리면 상단에서 문제를 생성할 수 있습니다' : '문서를 올리면 상단에서 질문을 생성할 수 있습니다')}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {isUserMode
                  ? '생성된 문제는 아래에서 수정하거나 삭제할 수 있습니다.'
                  : '생성된 질문은 아래에서 바로 수정하거나 삭제할 수 있습니다.'}
              </p>
              {isGenerating && (
                <div className="mt-4 max-w-xl rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold text-blue-700">
                    <span>생성 진행 중</span>
                    <span>{generationProgress}% · {generationElapsedSeconds}초</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                </div>
              )}
              {!isGenerating && generatedSummary && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  생성 완료 · {generationElapsedSeconds}초 소요
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {generatedSummary && (
                <button
                  type="button"
                  onClick={onDownloadQuestions}
                  className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                >
                  {isUserMode ? '문제 다운로드' : '질문 다운로드'}
                </button>
              )}

              {generatedSummary && (
                <button
                  type="button"
                  onClick={onMoveToEvaluation}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {isUserMode ? '답안지 제출하기' : '성능 평가로 이동'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {!hasQuestions && (
        <section className="grid items-start gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] 2xl:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">How it works</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">테스트셋 생성 흐름</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {emptyGuideSteps.map((item) => (
                <div
                  key={item.step}
                  className="relative flex min-h-[104px] flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 pr-16"
                >
                  <span className="absolute right-3.5 top-3.5 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-600">
                    STEP {item.step}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-5 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasQuestions && (
        <ReviewManager
          questions={generatedQuestions}
          onUpdateQuestion={onUpdateQuestion}
          onRemoveQuestion={onRemoveQuestion}
        />
      )}
    </div>
  );
}
