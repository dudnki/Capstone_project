import React, { useMemo, useState } from 'react';

type QuestionItem = {
  id: number;
  text: string;
};

type GeneratedSummary = {
  questionCount: number;
  format: 'csv' | 'json';
  createdAt: string;
};

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

const DOCUMENT_EXTENSIONS = ['PDF', 'CSV', 'TXT', 'JSON', 'JSONL', 'MD'];
const STEPS = ['문서 업로드', '질문 생성', '질문 검토', '질문 다운로드'];

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
  onDownloadQuestions,
  onMoveToEvaluation,
  onUpdateQuestion,
  onRemoveQuestion,
}: DatasetManagerProps) {
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);

  const statusCards = useMemo(
    () => [
      {
        label: '업로드',
        value: uploadedFile ? '완료' : '대기',
      },
      {
        label: '질문 세트',
        value: generatedSummary ? `${generatedSummary.questionCount}개` : '미생성',
      },
      {
        label: '다운로드',
        value: hasDownloadedQuestionSet ? '완료' : '전',
      },
    ],
    [uploadedFile, generatedSummary, hasDownloadedQuestionSet],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Testset Builder</p>
              <h2 className="mt-2 text-[30px] font-bold tracking-tight text-slate-900">테스트셋 생성</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                기준 문서를 업로드하고 질문을 생성한 뒤, 같은 화면에서 바로 검토하고 내려받습니다.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
              {statusCards.map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">기준 문서 업로드</h3>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {STEPS[Math.min(currentStep, 4) - 1]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">문서를 선택하면 바로 질문 생성 가능 상태가 표시됩니다.</p>
                </div>

                <div className="w-full max-w-[280px]">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>진행 상태</span>
                    <span className="font-semibold text-blue-700">{Math.min(currentStep, 4)} / 4</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {STEPS.map((step, index) => (
                      <div
                        key={step}
                        className={`h-1.5 rounded-full ${index + 1 <= Math.min(currentStep, 4) ? 'bg-blue-600' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.txt,.json,.jsonl,.md"
                className="hidden"
                onChange={handleFileChange}
              />

              <div
                className={`rounded-lg border border-dashed px-5 py-5 transition-colors ${
                  isDragging ? 'border-blue-300 bg-blue-50/70' : 'border-slate-300 bg-white'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploadedFile ? (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">선택된 문서</p>
                      <p className="mt-1 truncate text-base font-semibold text-slate-900">{uploadedFile.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatFileSize(uploadedFile.size)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        파일 변경
                      </button>
                      <button
                        type="button"
                        onClick={onRemoveFile}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                      >
                        제거
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <p className="text-base font-semibold text-slate-900">업로드할 기준 문서를 선택하세요</p>
                    <p className="mt-1 text-sm text-slate-500">질문 생성을 시작하는 첫 단계입니다.</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      문서 선택
                    </button>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {DOCUMENT_EXTENSIONS.map((ext) => (
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
                    {uploadedFile ? '질문 생성 준비 완료' : '문서를 올리면 질문 생성 버튼이 활성화됩니다'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">생성된 질문은 아래에서 바로 수정하고 삭제할 수 있습니다.</p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onGenerateQuestions}
                    disabled={!uploadedFile || isGenerating}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      !uploadedFile || isGenerating
                        ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isGenerating ? '질문 생성 중...' : '질문 생성하기'}
                  </button>
                  {generatedSummary && (
                    <button
                      type="button"
                      onClick={onDownloadQuestions}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      질문 다운로드
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="w-full shrink-0 bg-slate-50 p-5 lg:w-[288px]">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">현재 단계</h3>
                <p className="mt-1 text-sm text-slate-500">{STEPS[Math.min(currentStep, 4) - 1]}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">핵심 정보</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">문서</span>
                    <span className="text-xs font-semibold text-slate-900">{uploadedFile ? '업로드됨' : '없음'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">질문 세트</span>
                    <span className="text-xs font-semibold text-slate-900">
                      {generatedSummary ? `${generatedSummary.questionCount}개` : '미생성'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">다운로드</span>
                    <span className="text-xs font-semibold text-slate-900">{hasDownloadedQuestionSet ? '완료' : '전'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">다음 액션</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {generatedSummary
                    ? '질문을 검토한 뒤 다운로드하고 성능 평가 단계로 이동합니다.'
                    : '기준 문서를 업로드한 뒤 질문 생성 버튼을 실행하세요.'}
                </p>
              </div>

              {generatedSummary && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-semibold text-blue-700">생성 완료</p>
                  <p className="mt-1 text-sm text-blue-900">
                    {generatedSummary.questionCount}개 질문이 준비되었습니다.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onDownloadQuestions}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      질문 파일 다운로드
                    </button>
                    <button
                      type="button"
                      onClick={onMoveToEvaluation}
                      className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      성능 평가로 이동
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {generatedQuestions.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Review</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">질문 검토/수정</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {generatedQuestions.length}개 질문
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {generatedQuestions.map((question, index) => {
              const isEditing = editingQuestionId === question.id;

              return (
                <div key={question.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold text-blue-700">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <textarea
                            value={question.text}
                            onChange={(e) => onUpdateQuestion(question.id, e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none focus:border-blue-400"
                          />
                        ) : (
                          <p className="text-sm leading-6 text-slate-700">{question.text}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 pl-9 lg:pl-0">
                      <button
                        type="button"
                        onClick={() => setEditingQuestionId(isEditing ? null : question.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-700"
                      >
                        {isEditing ? '완료' : '수정'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveQuestion(question.id)}
                        className="rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-50"
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
