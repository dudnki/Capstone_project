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
  DocumentHistoryItem,
} from '../src/types';

const DOCUMENT_EXTENSIONS = ['.pdf', '.csv', '.xlsx'];
const RESULT_EXTENSIONS = ['.csv'];

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

  const [documentHistories, setDocumentHistories] = useState<DocumentHistoryItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

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
    return 3;
  }

  const currentStepValue = getCurrentStep();

  const headerDescription = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return '기준 문서를 업로드하고 질문 세트를 생성한 뒤 CSV로 내려받습니다.';
    }
    return '사용자 결과 CSV 파일을 업로드해 답변 품질을 평가합니다.';
  }, [activeMenu]);

  const headerStepLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      const labels = ['1단계 문서 업로드', '2단계 질문 생성', '3단계 질문 다운로드'];
      return labels[Math.min(currentStepValue, 3) - 1];
    }

    return evaluationSummary ? '평가 결과 확인' : '결과 CSV 업로드';
  }, [activeMenu, currentStepValue, evaluationSummary]);

  const headerPrimaryStatus = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return uploadedFile ? `문서 ${uploadedFile.name}` : '문서 미업로드';
    }

    return resultFile ? `결과 ${resultFile.name}` : '결과 CSV 미업로드';
  }, [activeMenu, uploadedFile, resultFile]);

  const headerSecondaryStatus = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      if (hasDownloadedQuestionSet) return '질문 다운로드 완료';
      return generatedSummary ? `질문 ${generatedSummary.questionCount}개` : '질문 생성 전';
    }

    return evaluationSummary
      ? `질문 ${evaluationSummary.evaluatedCount}개 평가`
      : generatedSummary
        ? '질문 세트 준비됨'
        : '질문 세트 필요';
  }, [activeMenu, generatedSummary, evaluationSummary, hasDownloadedQuestionSet]);

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

  const getFileExtension = (fileName: string) => {
    return fileName.split('.').pop()?.toUpperCase() ?? 'FILE';
  };

  const createHistoryId = () => {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const getNextHistoryStatusAfterResultRemove = (): DocumentHistoryItem['status'] => {
    if (hasDownloadedQuestionSet) return 'downloaded';
    if (generatedSummary) return 'generated';
    if (uploadedFile) return 'uploaded';
    return 'uploaded';
  };

  const updateActiveDocumentHistory = (
    patch: Partial<
      Pick<
        DocumentHistoryItem,
        | 'questionCount'
        | 'status'
        | 'generatedSummary'
        | 'generatedQuestions'
        | 'hasDownloadedQuestionSet'
        | 'resultFile'
        | 'evaluationSummary'
        | 'evaluationRows'
      >
    >,
  ) => {
    if (!activeDocumentId) return;

    setDocumentHistories((prev) =>
      prev.map((item) => (item.id === activeDocumentId ? { ...item, ...patch } : item)),
    );
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

  const applyDocumentFile = (file: File) => {
    const nextId = createHistoryId();

    const nextHistory: DocumentHistoryItem = {
      id: nextId,
      file,
      name: file.name,
      extension: getFileExtension(file.name),
      size: file.size,
      uploadedAt: new Date().toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      questionCount: 0,
      status: 'uploaded',
      generatedSummary: null,
      generatedQuestions: [],
      hasDownloadedQuestionSet: false,
      resultFile: null,
      evaluationSummary: null,
      evaluationRows: [],
    };

    setUploadedFile(file);
    setResultFile(null);
    resetGeneratedData();
    resetEvaluationData();
    setActiveDocumentId(nextId);
    setActiveMenu('테스트셋 생성');

    setDocumentHistories((prev) => [nextHistory, ...prev].slice(0, 12));
  };

  const handleSelectDocumentHistory = (id: string) => {
    const selected = documentHistories.find((item) => item.id === id);
    if (!selected) return;

    setActiveDocumentId(selected.id);
    setUploadedFile(selected.file);
    setGeneratedSummary(selected.generatedSummary);
    setGeneratedQuestions(selected.generatedQuestions);
    setHasDownloadedQuestionSet(selected.hasDownloadedQuestionSet);
    setResultFile(selected.resultFile);
    setEvaluationSummary(selected.evaluationSummary);
    setEvaluationRows(selected.evaluationRows);

    if (selected.status === 'evaluated') {
      setActiveMenu('성능 평가');
    } else {
      setActiveMenu('테스트셋 생성');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (validateFile(file, DOCUMENT_EXTENSIONS)) {
      applyDocumentFile(file);
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

      updateActiveDocumentHistory({
        resultFile: file,
        evaluationSummary: null,
        evaluationRows: [],
      });
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
      applyDocumentFile(file);
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

      updateActiveDocumentHistory({
        resultFile: file,
        evaluationSummary: null,
        evaluationRows: [],
      });
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setResultFile(null);
    resetGeneratedData();
    resetEvaluationData();

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const handleRemoveResultFile = () => {
    setResultFile(null);
    resetEvaluationData();

    updateActiveDocumentHistory({
      status: getNextHistoryStatusAfterResultRemove(),
      resultFile: null,
      evaluationSummary: null,
      evaluationRows: [],
    });

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

      const nextSummary: GeneratedSummary = {
        questionCount: questions.length,
        format: 'csv',
        createdAt: new Date().toLocaleString('ko-KR'),
      };

      setGeneratedQuestions(questions);
      setGeneratedSummary(nextSummary);
      setHasDownloadedQuestionSet(false);
      setResultFile(null);
      resetEvaluationData();

      updateActiveDocumentHistory({
        questionCount: questions.length,
        status: 'generated',
        generatedSummary: nextSummary,
        generatedQuestions: questions,
        hasDownloadedQuestionSet: false,
        resultFile: null,
        evaluationSummary: null,
        evaluationRows: [],
      });
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
            '이 문서는 기준 문서를 바탕으로 질문을 생성하고, 사용자 결과 제출을 통해 챗봇 답변 품질을 평가하는 흐름을 설명합니다.',
          answerRelevancyScore: 0.87,
          answerAccuracyScore: 0.84,
          answerSimilarityScore: 0.83,
          overallScore: 0.85,
          status: getRowStatus(0.85),
        },
        {
          id: 2,
          question: '문서에서 가장 중요한 원칙 또는 단계를 설명해 주세요.',
          answer: '질문 생성 후 사용자 챗봇에서 실행한 결과를 다시 제출받아 평가하는 단계가 핵심입니다.',
          answerRelevancyScore: 0.89,
          answerAccuracyScore: 0.85,
          answerSimilarityScore: 0.84,
          overallScore: 0.86,
          status: getRowStatus(0.86),
        },
        {
          id: 3,
          question: '결과 제출 파일에는 어떤 항목이 포함되어야 하나요?',
          answer: 'question과 answer 컬럼이 포함된 CSV 파일을 제출하면 됩니다.',
          answerRelevancyScore: 0.86,
          answerAccuracyScore: 0.83,
          answerSimilarityScore: 0.82,
          overallScore: 0.84,
          status: getRowStatus(0.84),
        },
        {
          id: 4,
          question: '이 시스템은 무엇을 중심으로 평가하나요?',
          answer: '검색 성능을 직접 평가하기보다 답변이 질문에 맞는지와 문서 내용과 일치하는지를 중심으로 봅니다.',
          answerRelevancyScore: 0.86,
          answerAccuracyScore: 0.84,
          answerSimilarityScore: 0.83,
          overallScore: 0.84,
          status: getRowStatus(0.84),
        },
      ];

      const average = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;

      const nextEvaluationSummary: EvaluationSummary = {
        overallScore: average(rows.map((row) => row.overallScore)),
        answerRelevancyScore: average(rows.map((row) => row.answerRelevancyScore)),
        answerAccuracyScore: average(rows.map((row) => row.answerAccuracyScore)),
        answerSimilarityScore: average(rows.map((row) => row.answerSimilarityScore)),
        evaluatedCount: rows.length,
      };

      setEvaluationRows(rows);
      setEvaluationSummary(nextEvaluationSummary);

      updateActiveDocumentHistory({
        status: 'evaluated',
        resultFile,
        evaluationSummary: nextEvaluationSummary,
        evaluationRows: rows,
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

    updateActiveDocumentHistory({
      status: 'downloaded',
      hasDownloadedQuestionSet: true,
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
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={(menu) => setActiveMenu(menu as MenuType)}
          documentHistories={documentHistories}
          activeDocumentId={activeDocumentId}
          onSelectDocumentHistory={handleSelectDocumentHistory}
        />

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
                  onDownloadQuestions={handleDownloadQuestions}
                  onMoveToEvaluation={() => setActiveMenu('성능 평가')}
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