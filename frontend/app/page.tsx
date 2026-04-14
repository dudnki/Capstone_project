'use client';

import React, { useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DatasetManager from '../components/DatasetManager';
import EvaluationResult from '../components/EvaluationResult';
import type {
  MenuType,
  QuestionItem,
  GeneratedSummary,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
} from '../src/types';

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
  const mainScrollRef = useRef<HTMLElement | null>(null);

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

    return evaluationSummary
      ? `질문 ${evaluationSummary.evaluatedCount}개 평가`
      : generatedSummary
        ? '질문 세트 준비됨'
        : '질문 세트 필요';
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
        { id: 2, text: '문서에서 가장 중요한 원칙 또는 단계를 설명해 주세요.' },
        { id: 3, text: '문서 내용을 바탕으로 비교형 질문 하나를 만들어 주세요.' },
        { id: 4, text: '문서에서 근거를 찾아 답해야 하는 검증형 질문을 만들어 주세요.' },
        { id: 5, text: '실제 사용자 관점에서 자주 물을 만한 질문을 하나 만들어 주세요.' },
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

  const getRowStatus = (score: number): EvaluationRowStatus => {
    if (score >= 0.85) return 'good';
    if (score >= 0.7) return 'review';
    return 'poor';
  };

  const handleRunEvaluation = async () => {
    if (!resultFile) return;

    setIsEvaluating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const rows: EvaluationRow[] = [
        {
          id: 1,
          question: '문서의 핵심 목적 또는 주제를 한 문장으로 설명해 주세요.',
          answer:
            '이 문서는 기준 문서를 바탕으로 질문을 생성하고, 사용자 결과 제출을 통해 RAG를 평가하는 흐름을 설명합니다.',
          retrievedContext: [
            '기준 문서를 업로드하면 질문 세트를 생성하고, 사용자는 결과 파일을 다시 업로드해 평가를 진행합니다.',
            'retrieved_context를 포함한 결과를 받아 검색 성능과 생성 성능을 함께 평가합니다.',
          ],
          retrievalScore: 0.89,
          generationScore: 0.92,
          groundedScore: 0.87,
          overallScore: 0.89,
          status: getRowStatus(0.89),
        },
        {
          id: 2,
          question: '문서에서 가장 중요한 원칙 또는 단계를 설명해 주세요.',
          answer: '질문 생성 후 사용자 RAG에서 실제로 실행한 결과를 다시 제출받는 단계가 핵심입니다.',
          retrievedContext: [
            '사용자는 생성된 질문 파일을 내려받아 자신의 RAG 시스템에 적용한 뒤 결과를 제출합니다.',
          ],
          retrievalScore: 0.82,
          generationScore: 0.85,
          groundedScore: 0.79,
          overallScore: 0.82,
          status: getRowStatus(0.82),
        },
        {
          id: 3,
          question: 'retrieved_context가 왜 필요한가요?',
          answer: '검색된 문맥이 있어야 답변뿐 아니라 검색 단계까지 함께 평가할 수 있습니다.',
          retrievedContext: [
            'retrieved_context는 검색 단계에서 실제로 가져온 문서 조각 또는 근거 문맥을 의미합니다.',
            '답변만 평가하면 QA 평가에 가깝고, 문맥까지 있어야 진짜 RAG 평가가 가능합니다.',
          ],
          retrievalScore: 0.71,
          generationScore: 0.78,
          groundedScore: 0.68,
          overallScore: 0.72,
          status: getRowStatus(0.72),
        },
      ];

      const average = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;

      setEvaluationRows(rows);
      setEvaluationSummary({
        overallScore: average(rows.map((row) => row.overallScore)),
        retrievalScore: average(rows.map((row) => row.retrievalScore)),
        generationScore: average(rows.map((row) => row.generationScore)),
        groundedScore: average(rows.map((row) => row.groundedScore)),
        evaluatedCount: rows.length,
      });
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

  const getMainScrollTop = () => mainScrollRef.current?.scrollTop ?? 0;

  const restoreMainScrollTop = (top: number) => {
    const el = mainScrollRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = top;
      requestAnimationFrame(() => {
        el.scrollTop = top;
      });
    });
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

        <main
          ref={mainScrollRef}
          className="min-w-0 flex-1 overflow-y-scroll"
          style={{ scrollbarGutter: 'stable' }}
        >
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
                  getScrollTop={getMainScrollTop}
                  restoreScrollTop={restoreMainScrollTop}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}