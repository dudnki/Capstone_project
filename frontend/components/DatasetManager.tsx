import React, { useMemo, useState } from 'react';
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
  onDownloadQuestions: () => void;
  onMoveToEvaluation: () => void;
  onUpdateQuestion: (id: number, text: string) => void;
  onRemoveQuestion: (id: number) => void;
}

const DOCUMENT_EXTENSIONS = ['PDF', 'csv', 'XLSX'];
const STEPS = ['문서 업로드', '질문 생성', '질문 검토', '질문 다운로드'];

export default function DatasetManager({
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
  onDownloadQuestions,
  onMoveToEvaluation,
  onUpdateQuestion,
  onRemoveQuestion,
}: DatasetManagerProps) {
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);

  const hasQuestions = generatedQuestions.length > 0;

  const statusCards = useMemo(
    () => [
      { label: '문서 업로드', value: uploadedFile ? '완료' : '대기' },
      { label: '질문 세트', value: generatedSummary ? `${generatedSummary.questionCount}개 생성` : '미생성' },
      { label: '질문 다운로드', value: hasDownloadedQuestionSet ? '완료' : '전' },
    ],
    [uploadedFile, generatedSummary, hasDownloadedQuestionSet],
  );

  const emptyGuideSteps = [
    {
      step: '01',
      title: '기준 문서 업로드',
      description: 'PDF, CSV, XLSX 문서를 업로드합니다.',
    },
    {
      step: '02',
      title: '질문 세트 생성',
      description: '문서를 기반으로 평가용 질문 세트를 자동 생성합니다.',
    },
    {
      step: '03',
      title: '질문 검토 및 다운로드',
      description: '생성된 질문을 수정하거나 삭제한 뒤 CSV 파일로 내려받습니다.',
    },
  ];

  return (
    <div className="flex h-full flex-col gap-5">
      <section
        className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${
          hasQuestions ? '' : 'flex-1'
        }`}
      >
        <div className="flex-shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Testset Builder</p>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">테스트셋 생성</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                기준 문서를 업로드하고 질문을 생성한 뒤, 같은 화면에서 바로 검토하고 내려받습니다.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[372px]">
              {statusCards.map((item) => (
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
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-slate-900">기준 문서 업로드</h3>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {STEPS[Math.min(currentStep, 4) - 1]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  업로드한 문서를 바탕으로 평가용 질문 세트를 생성합니다.
                </p>
              </div>

              <div className="w-full max-w-[280px] rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>진행 단계</span>
                  <span className="font-semibold text-blue-700">{Math.min(currentStep, 4)} / 4</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {STEPS.map((step, index) => (
                    <div
                      key={step}
                      className={`h-1.5 rounded-full ${
                        index + 1 <= Math.min(currentStep, 4) ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf, .csv, .xlsx"
              className="hidden"
              onChange={handleFileChange}
            />

            <div
              className={`mt-4 flex min-h-[190px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-8 transition-colors ${
                isDragging ? 'border-blue-300 bg-blue-50/70' : 'border-slate-300 bg-white'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploadedFile ? (
                <div className="flex w-full flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500">선택된 문서</p>
                    <p className="mt-1 truncate text-xl font-semibold text-slate-900">{uploadedFile.name}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatFileSize(uploadedFile.size)}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[272px]">
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
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">
                    업로드할 기준 문서를 선택하세요
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    PDF, CSV, XLSX 문서를 업로드할 수 있습니다.
                    <br />
                    파일을 끌어다 놓거나 아래 버튼을 눌러 선택하세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                  >
                    문서 선택
                  </button>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
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

          <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {uploadedFile ? '질문 생성 준비가 완료되었습니다' : '문서를 올리면 상단에서 질문을 생성할 수 있습니다'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                생성된 질문은 아래에서 바로 수정하거나 삭제할 수 있습니다.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {generatedSummary && (
                <button
                  type="button"
                  onClick={onDownloadQuestions}
                  className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                >
                  질문 다운로드
                </button>
              )}

              {generatedSummary && (
                <button
                  type="button"
                  onClick={onMoveToEvaluation}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  성능 평가로 이동
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {!hasQuestions && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">How it works</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">테스트셋 생성 흐름</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {emptyGuideSteps.map((item) => (
                <div key={item.step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                    STEP {item.step}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">제출 형식</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">결과 제출 파일 예시</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              성능 평가 단계에서는 question, answer 컬럼이 포함된 엑셀 파일이 필요합니다.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-6 text-slate-700">{`question | answer
질문 내용 | 사용자 챗봇 답변`}</pre>
          </div>
        </section>
      )}

      {hasQuestions && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">질문 검토</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">질문 검토 및 수정</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {generatedQuestions.length}개 질문
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {generatedQuestions.map((question, index) => {
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
                            onChange={(e) => onUpdateQuestion(question.id, e.target.value)}
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
      )}
    </div>
  );
}