'use client';

import React, { useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DatasetManager from '../components/DatasetManager';
import EvaluationResult from '../components/EvaluationResult';

type MenuType = '테스트셋 생성' | '성능 평가';

export type QuestionItem = {
  id: number;
  text: string;
};

export type GeneratedSummary = {
  questionCount: number;
  format: 'csv' | 'json';
  createdAt: string;
};

export type EvaluationSummary = {
  retrievalScore: number;
  answerScore: number;
  groundedScore: number;
};

export type EvaluationRow = {
  id: number;
  question: string;
  answer: string;
  retrievedContext: string;
  score: number;
};

const DOCUMENT_EXTENSIONS = ['.pdf', '.csv', '.txt', '.json', '.jsonl', '.md'];
const RESULT_EXTENSIONS = ['.csv', '.json', '.jsonl'];

export default function RagEvaluationPage() {
  const [activeMenu, setActiveMenu] = useState<MenuType>('테스트셋 생성');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const [generatedSummary, setGeneratedSummary] = useState<GeneratedSummary | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionItem[]>([]);
  const [hasDownloadedQuestionSet, setHasDownloadedQuestionSet] = useState(false);

  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummary | null>(null);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRow[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingResult, setIsDraggingResult] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultFileInputRef = useRef<HTMLInputElement>(null);

  const canGenerateQuestions = Boolean(uploadedFile);
  const canRunEvaluation = Boolean(resultFile);

  function getCurrentStep() {
    if (!uploadedFile) return 1;
    if (!generatedSummary) return 2;
    if (!hasDownloadedQuestionSet) return 3;
    if (!resultFile) return 4;
    return 5;
  }

  const currentStepValue = getCurrentStep();

  const headerDescription = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return '기준 문서를 업로드하고 질문 세트를 생성한 뒤 필요한 질문만 검토합니다.';
    }
    return '사용자 결과 파일을 업로드해 검색 성능과 생성 성능을 함께 평가합니다.';
  }, [activeMenu]);

  const headerStepLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      const labels = ['1단계 문서 업로드', '2단계 질문 생성', '3단계 질문 검토', '4단계 질문 다운로드'];
      return labels[Math.min(currentStepValue, 4) - 1];
    }

    return evaluationSummary ? '평가 결과 확인' : '결과 파일 업로드';
  }, [activeMenu, currentStepValue, evaluationSummary]);

  const headerPrimaryStatus = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return uploadedFile ? `문서 ${uploadedFile.name}` : '문서 미업로드';
    }

    return resultFile ? `결과 ${resultFile.name}` : '결과 파일 미업로드';
  }, [activeMenu, uploadedFile, resultFile]);

  const headerSecondaryStatus = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return generatedSummary ? `질문 ${generatedSummary.questionCount}개` : '질문 생성 전';
    }

    return evaluationSummary ? '평가 완료' : generatedSummary ? '질문 세트 준비됨' : '질문 세트 필요';
  }, [activeMenu, generatedSummary, evaluationSummary]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = (file: File, allowedExtensions: string[]) => {
    const maxSize = 1024 * 1024 * 1024;
    const fileExt = `.${file.name.split('.').pop()?.toLowerCase()}`;

    if (file.size > maxSize) return false;
    return allowedExtensions.includes(fileExt);
  };

  const resetGeneratedData = () => {
    setGeneratedSummary(null);
    setGeneratedQuestions([]);
    setHasDownloadedQuestionSet(false);
  };

  const resetEvaluationData = () => {
    setEvaluationSummary(null);
    setEvaluationRows([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (validateFile(file, DOCUMENT_EXTENSIONS)) {
      setUploadedFile(file);
      resetGeneratedData();
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResultFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (validateFile(file, RESULT_EXTENSIONS)) {
      setResultFile(file);
      resetEvaluationData();
    } else if (resultFileInputRef.current) {
      resultFileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (validateFile(file, DOCUMENT_EXTENSIONS)) {
      setUploadedFile(file);
      resetGeneratedData();
    }
  };

  const handleResultDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingResult(true);
  };

  const handleResultDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingResult(false);
  };

  const handleResultDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingResult(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (validateFile(file, RESULT_EXTENSIONS)) {
      setResultFile(file);
      resetEvaluationData();
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    resetGeneratedData();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveResultFile = () => {
    setResultFile(null);
    resetEvaluationData();
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const handleGenerateQuestions = async () => {
    if (!uploadedFile) return;

    setIsGenerating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const questions: QuestionItem[] = [
        { id: 1, text: '문서의 핵심 목적 또는 주제를 한 문장으로 설명해 주세요.' },
        { id: 2, text: '문서에서 가장 중요한 원칙 또는 단계는 무엇인가요?' },
        { id: 3, text: '문서에서 설명하는 주요 개념 두 가지를 비교해 설명해 주세요.' },
        { id: 4, text: '문서 내용을 바탕으로 사용자가 자주 묻는 질문은 무엇일까요?' },
        { id: 5, text: '문서에서 근거를 찾아 답해야 하는 검증형 질문 하나를 만들어 주세요.' },
      ];

      setGeneratedQuestions(questions);
      setGeneratedSummary({
        questionCount: questions.length,
        format: 'csv',
        createdAt: new Date().toLocaleString('ko-KR'),
      });
      setHasDownloadedQuestionSet(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunEvaluation = async () => {
    if (!resultFile) return;

    setIsEvaluating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setEvaluationSummary({
        retrievalScore: 0.82,
        answerScore: 0.88,
        groundedScore: 0.79,
      });

      setEvaluationRows([
        {
          id: 1,
          question: '문서의 핵심 목적 또는 주제를 한 문장으로 설명해 주세요.',
          answer: '문서는 RAG 평가를 위해 질문 생성과 결과 제출 기반 평가 흐름을 설명합니다.',
          retrievedContext: '기준 문서 업로드 후 질문 세트 생성 및 결과 파일 업로드를 통해 최종 평가를 수행합니다.',
          score: 0.91,
        },
        {
          id: 2,
          question: '문서에서 가장 중요한 단계는 무엇인가요?',
          answer: '질문 생성 이후 사용자 테스트 결과 파일을 다시 업로드하는 단계가 중요합니다.',
          retrievedContext: '사용자는 생성된 질문 파일을 내려받아 자신의 RAG 시스템에 적용한 뒤 결과를 제출합니다.',
          score: 0.84,
        },
        {
          id: 3,
          question: 'retrieved_context가 왜 필요한가요?',
          answer: '검색된 근거 문맥이 있어야 검색 성능과 생성 성능을 함께 판단할 수 있습니다.',
          retrievedContext: 'retrieved_context는 검색 단계에서 가져온 문서 조각 또는 근거 문맥을 의미합니다.',
          score: 0.73,
        },
      ]);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleDownloadQuestions = () => {
    if (generatedQuestions.length === 0) return;

    const nowDate = new Date().toISOString().slice(0, 10);
    const headers = ['question'];
    const rows = generatedQuestions.map((question) => question.text);
    const csv = [headers.join(','), ...rows.map((q) => `"${q.replace(/"/g, '""')}"`)].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `rag_questions_${nowDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    setHasDownloadedQuestionSet(true);
  };

  const handleUpdateQuestion = (id: number, text: string) => {
    setGeneratedQuestions((prev) => prev.map((question) => (question.id === id ? { ...question, text } : question)));
  };

  const handleRemoveQuestion = (id: number) => {
    setGeneratedQuestions((prev) => {
      const next = prev.filter((question) => question.id !== id);
      setGeneratedSummary((current) =>
        current
          ? {
              ...current,
              questionCount: next.length,
            }
          : current,
      );
      return next;
    });
  };

  const handleActionClick = async () => {
    if (activeMenu === '테스트셋 생성') {
      await handleGenerateQuestions();
      return;
    }

    await handleRunEvaluation();
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        activeMenu={activeMenu}
        isGenerating={isGenerating}
        isEvaluating={isEvaluating}
        onActionClick={handleActionClick}
        isActionDisabled={activeMenu === '테스트셋 생성' ? !canGenerateQuestions : !canRunEvaluation}
        description={headerDescription}
        currentStepLabel={headerStepLabel}
        primaryStatus={headerPrimaryStatus}
        secondaryStatus={headerSecondaryStatus}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeMenu={activeMenu} setActiveMenu={(menu) => setActiveMenu(menu as MenuType)} />

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* h-full 체인: main → wrapper → inner → DatasetManager 까지 높이 전달 */}
          <div className="flex h-full w-full flex-col px-4 py-4 lg:px-6 lg:py-6 2xl:px-8">
            <div className="flex min-h-0 flex-1 flex-col">
              {activeMenu === '테스트셋 생성' ? (
                <DatasetManager
                  isGenerating={isGenerating}
                  uploadedFile={uploadedFile}
                  generatedSummary={generatedSummary}
                  generatedQuestions={generatedQuestions}
                  hasDownloadedQuestionSet={hasDownloadedQuestionSet}
                  currentStep={currentStepValue}
                  isDragging={isDragging}
                  fileInputRef={fileInputRef}
                  handleDragOver={handleDragOver}
                  handleDragLeave={handleDragLeave}
                  handleDrop={handleDrop}
                  handleFileChange={handleFileChange}
                  formatFileSize={formatFileSize}
                  onRemoveFile={handleRemoveFile}
                  onGenerateQuestions={handleGenerateQuestions}
                  onDownloadQuestions={handleDownloadQuestions}
                  onMoveToEvaluation={() => setActiveMenu('성능 평가')}
                  onUpdateQuestion={handleUpdateQuestion}
                  onRemoveQuestion={handleRemoveQuestion}
                />
              ) : (
                <EvaluationResult
                  isEvaluating={isEvaluating}
                  resultFile={resultFile}
                  generatedSummary={generatedSummary}
                  evaluationSummary={evaluationSummary}
                  evaluationRows={evaluationRows}
                  resultFileInputRef={resultFileInputRef}
                  isDraggingResult={isDraggingResult}
                  handleResultDragOver={handleResultDragOver}
                  handleResultDragLeave={handleResultDragLeave}
                  handleResultDrop={handleResultDrop}
                  handleResultFileChange={handleResultFileChange}
                  onRemoveResultFile={handleRemoveResultFile}
                  onRunEvaluation={handleRunEvaluation}
                  formatFileSize={formatFileSize}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
