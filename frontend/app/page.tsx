'use client';

import React, { useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DatasetManager from '../components/DatasetManager';
import EvaluationResult from '../components/EvaluationResult';
import type {
  MenuType,
  EvaluationMode,
  QuestionItem,
  GeneratedSummary,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
  DocumentHistoryItem,
} from '../src/types';

const BASE_URL = 'http://localhost:8001';

const DOCUMENT_EXTENSIONS = ['.pdf'];
const RESULT_EXTENSIONS = ['.csv'];

type BackendMeta = {
  documentId: string | null;
  questionByQaId: Record<string, string>;
};

type PipelineResponseRow = {
  index: number;
  qa_uuid: string | null;
  document_uuid: string;
  q: string;
  doc: string;
  dtype: string;
  answer: string;
  score: number;
  faithfulness: number;
  answer_relevancy: number;
};

type EvaluationSubmitResponse = {
  success: boolean;
  summary: {
    evaluatedCount: number;
    overallAvgScore: number;
    faithfulness: number;
    answerRelevancy: number;
    answerCorrectness: number;
  };
  rows: Array<{
    qa_id: string;
    question: string;
    answer: string;
    scores: {
      faithfulness: number;
      answer_relevancy: number;
      answer_correctness: number;
    };
    avg_score: number;
  }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getString = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getNumber = (record: Record<string, unknown>, key: string) => {
  const value = record[key];

  if (typeof value === 'number') return value;

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

const clampScore = (score: number) => {
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
};

const escapeCsvCell = (value: string) => {
  return `"${value.replace(/"/g, '""')}"`;
};

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data: unknown = await response.json();
    if (isRecord(data)) {
      const detail = data.detail;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    return fallback;
  }

  return fallback;
};

export default function RagEvaluationPage() {
  const [activeMenu, setActiveMenu] = useState<MenuType>('테스트셋 생성');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('chatbot');

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const [generatedSummary, setGeneratedSummary] = useState<GeneratedSummary | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionItem[]>([]);
  const [hasDownloadedQuestionSet, setHasDownloadedQuestionSet] = useState(false);

  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummary | null>(null);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRow[]>([]);

  const [documentHistories, setDocumentHistories] = useState<DocumentHistoryItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [backendMetaByHistoryId, setBackendMetaByHistoryId] = useState<Record<string, BackendMeta>>({});

  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingResult, setIsDraggingResult] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultFileInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const activeBackendMeta = activeDocumentId ? backendMetaByHistoryId[activeDocumentId] : null;
  const canGenerateQuestions = Boolean(uploadedFile);
  const canRunEvaluation = Boolean(resultFile && activeBackendMeta?.documentId);

  function getCurrentStep() {
    if (!uploadedFile) return 1;
    if (!generatedSummary) return 2;
    if (!hasDownloadedQuestionSet) return 3;
    return 4;
  }

  const currentStepValue = getCurrentStep();

  const headerDescription = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return '원본 PDF를 업로드하고 질문 세트를 생성한 뒤 CSV로 내려받습니다.';
    }

    return evaluationMode === 'chatbot'
      ? '질문 CSV를 RAG/챗봇에 실행해 만든 답변을 CSV로 제출하고 평가합니다.'
      : '정답지나 별도 시스템 결과를 CSV로 제출하고 문서 기준으로 평가합니다.';
  }, [activeMenu, evaluationMode]);

  const headerStepLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      const labels = ['1단계 PDF 업로드', '2단계 질문 생성', '3단계 질문 검토/수정', '4단계 질문 다운로드'];
      return labels[Math.min(currentStepValue, 4) - 1];
    }

    return evaluationSummary ? '평가 결과 확인' : '결과 파일 업로드';
  }, [activeMenu, currentStepValue, evaluationSummary]);

  const headerActionLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return generatedQuestions.length > 0 ? '질문 CSV 다운로드' : '질문 생성하기';
    }

    return '평가 실행하기';
  }, [activeMenu, generatedQuestions.length]);

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

  const getRowStatus = (score: number): EvaluationRowStatus => {
    if (score >= 0.85) return 'good';
    if (score >= 0.7) return 'review';
    return 'poor';
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

  const clearCurrentWorkspace = () => {
    setUploadedFile(null);
    setResultFile(null);

    resetGeneratedData();
    resetEvaluationData();

    setActiveDocumentId(null);
    setActiveMenu('테스트셋 생성');
    setEvaluationMode('chatbot');

    setIsDragging(false);
    setIsDraggingResult(false);
    setIsGenerating(false);
    setIsEvaluating(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const handleStartNewEvaluation = () => {
    clearCurrentWorkspace();
  };

  const handleDeleteDocumentHistory = (id: string) => {
    setDocumentHistories((prev) => prev.filter((item) => item.id !== id));

    setBackendMetaByHistoryId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (activeDocumentId === id) {
      clearCurrentWorkspace();
    }
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

    setBackendMetaByHistoryId((prev) => ({
      ...prev,
      [nextId]: {
        documentId: null,
        questionByQaId: {},
      },
    }));

    setDocumentHistories((prev) => [nextHistory, ...prev].slice(0, 12));
  };

  const normalizePipelineResponse = (data: unknown) => {
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data.filter(isRecord)
      : isRecord(data) && Array.isArray(data.data)
        ? data.data.filter(isRecord)
        : isRecord(data) && Array.isArray(data.questions)
          ? data.questions.filter(isRecord)
          : [];

    const rows: PipelineResponseRow[] = items.map((item, index) => ({
      index: getNumber(item, 'index') ?? index + 1,
      qa_uuid: getString(item, 'qa_uuid') ?? null,
      document_uuid: getString(item, 'document_uuid') ?? getString(item, 'document_id') ?? '',
      q: getString(item, 'q') ?? getString(item, 'question') ?? '',
      doc: getString(item, 'doc') ?? '',
      dtype: getString(item, 'dtype') ?? '',
      answer: getString(item, 'answer') ?? '',
      score: getNumber(item, 'score') ?? 0,
      faithfulness: getNumber(item, 'faithfulness') ?? 0,
      answer_relevancy: getNumber(item, 'answer_relevancy') ?? 0,
    }));

    const questions: QuestionItem[] = rows
      .map((item) => ({
        id: item.qa_uuid ?? String(item.index),
        text: item.q,
      }))
      .filter((item) => item.text.trim().length > 0);

    const questionByQaId = rows.reduce<Record<string, string>>((acc, item) => {
      const qaId = item.qa_uuid ?? String(item.index);
      if (item.q) acc[qaId] = item.q;
      return acc;
    }, {});

    return {
      documentId: rows.find((item) => item.document_uuid)?.document_uuid ?? null,
      questions,
      questionByQaId,
    };
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
    } else {
      alert('PDF 파일만 업로드할 수 있습니다.');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    } else {
      alert('결과 파일은 CSV만 업로드할 수 있습니다.');
      if (resultFileInputRef.current) resultFileInputRef.current.value = '';
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
    } else {
      alert('PDF 파일만 업로드할 수 있습니다.');
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
    } else {
      alert('결과 파일은 CSV만 업로드할 수 있습니다.');
    }
  };

  const handleRemoveFile = () => {
    clearCurrentWorkspace();
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

  const handleEvaluationModeChange = (nextMode: EvaluationMode) => {
    setEvaluationMode(nextMode);
    resetEvaluationData();
  };

  const handleGenerateQuestions = async () => {
    if (!uploadedFile) return;

    const currentHistoryId = activeDocumentId;

    if (!currentHistoryId) {
      alert('문서 기록이 없습니다. PDF를 다시 업로드해 주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', uploadedFile);

      const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error(await readErrorMessage(uploadResponse, 'PDF 업로드에 실패했습니다.'));
      }

      const uploadData: unknown = await uploadResponse.json();

      if (!isRecord(uploadData)) {
        throw new Error('업로드 응답 형식이 올바르지 않습니다.');
      }

      const savedFilename = getString(uploadData, 'saved_filename');
      const originalFilename = getString(uploadData, 'original_filename') ?? uploadedFile.name;

      if (!savedFilename) {
        throw new Error('백엔드에서 saved_filename을 받지 못했습니다.');
      }

      const pipelineResponse = await fetch(`${BASE_URL}/api/pipeline/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saved_filename: savedFilename,
          original_filename: originalFilename,
        }),
      });

      if (!pipelineResponse.ok) {
        throw new Error(await readErrorMessage(pipelineResponse, '질문 생성에 실패했습니다.'));
      }

      const pipelineData: unknown = await pipelineResponse.json();
      const normalized = normalizePipelineResponse(pipelineData);

      if (normalized.questions.length === 0) {
        throw new Error('생성된 질문이 없습니다.');
      }

      if (!normalized.documentId) {
        throw new Error('백엔드에서 document_uuid를 받지 못했습니다.');
      }

      const nextSummary: GeneratedSummary = {
        questionCount: normalized.questions.length,
        format: 'csv',
        createdAt: new Date().toLocaleString('ko-KR'),
      };

      setGeneratedQuestions(normalized.questions);
      setGeneratedSummary(nextSummary);
      setHasDownloadedQuestionSet(false);
      setResultFile(null);
      resetEvaluationData();

      setBackendMetaByHistoryId((prev) => ({
        ...prev,
        [currentHistoryId]: {
          documentId: normalized.documentId,
          questionByQaId: normalized.questionByQaId,
        },
      }));

      updateActiveDocumentHistory({
        questionCount: normalized.questions.length,
        status: 'generated',
        generatedSummary: nextSummary,
        generatedQuestions: normalized.questions,
        hasDownloadedQuestionSet: false,
        resultFile: null,
        evaluationSummary: null,
        evaluationRows: [],
      });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : '질문 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadQuestions = () => {
    if (generatedQuestions.length === 0) return;

    const nowDate = new Date().toISOString().slice(0, 10);
    const headers = ['qa_id', 'question', 'answer'];

    const rows = generatedQuestions.map((question) => {
      return [escapeCsvCell(question.id), escapeCsvCell(question.text), escapeCsvCell('')].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
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

  const handleQuestionTextChange = (questionId: string, nextText: string) => {
    const nextQuestionsSnapshot = generatedQuestions.map((question) =>
      question.id === questionId ? { ...question, text: nextText } : question,
    );

    setGeneratedQuestions(nextQuestionsSnapshot);
    setHasDownloadedQuestionSet(false);

    updateActiveDocumentHistory({
      status: 'generated',
      generatedQuestions: nextQuestionsSnapshot,
      hasDownloadedQuestionSet: false,
    });

    if (!activeDocumentId) return;

    setBackendMetaByHistoryId((prev) => {
      const currentMeta = prev[activeDocumentId];
      if (!currentMeta) return prev;

      return {
        ...prev,
        [activeDocumentId]: {
          ...currentMeta,
          questionByQaId: {
            ...currentMeta.questionByQaId,
            [questionId]: nextText,
          },
        },
      };
    });
  };

  const handleRemoveQuestion = (questionId: string) => {
    const nextQuestionsSnapshot = generatedQuestions.filter((question) => question.id !== questionId);
    const nextSummary = generatedSummary
      ? { ...generatedSummary, questionCount: nextQuestionsSnapshot.length }
      : null;

    setGeneratedQuestions(nextQuestionsSnapshot);
    setGeneratedSummary(nextSummary);
    setHasDownloadedQuestionSet(false);

    updateActiveDocumentHistory({
      questionCount: nextQuestionsSnapshot.length,
      status: 'generated',
      generatedSummary: nextSummary,
      generatedQuestions: nextQuestionsSnapshot,
      hasDownloadedQuestionSet: false,
    });
  };

  const handleRunEvaluation = async () => {
    if (!resultFile) return;

    if (!activeDocumentId) {
      alert('문서 기록이 없습니다. PDF를 다시 업로드해 주세요.');
      return;
    }

    const activeMeta = backendMetaByHistoryId[activeDocumentId];

    if (!activeMeta?.documentId) {
      alert('평가할 문서 정보가 없습니다. 먼저 테스트셋 생성에서 질문을 생성해 주세요.');
      return;
    }

    setIsEvaluating(true);

    try {
      const resultFormData = new FormData();
      resultFormData.append('file', resultFile);

      const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: resultFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error(await readErrorMessage(uploadResponse, '결과 파일 업로드에 실패했습니다.'));
      }

      const uploadData: unknown = await uploadResponse.json();

      if (!isRecord(uploadData)) {
        throw new Error('결과 파일 업로드 응답 형식이 올바르지 않습니다.');
      }

      const savedFilename = getString(uploadData, 'saved_filename');
      const originalFilename = getString(uploadData, 'original_filename') ?? resultFile.name;

      if (!savedFilename) {
        throw new Error('백엔드에서 saved_filename을 받지 못했습니다.');
      }

      const response = await fetch(`${BASE_URL}/api/evaluations/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saved_filename: savedFilename,
          original_filename: originalFilename,
          document_id: activeMeta.documentId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, '평가 실행에 실패했습니다.'));
      }

      const responseData = (await response.json()) as EvaluationSubmitResponse;

      if (!responseData.success || !Array.isArray(responseData.rows)) {
        throw new Error('평가 응답 형식이 올바르지 않습니다.');
      }

      const nextEvaluationRows: EvaluationRow[] = responseData.rows.map((row) => {
        const answerRelevancyScore = clampScore(row.scores.answer_relevancy);
        const answerAccuracyScore = clampScore(row.scores.faithfulness);
        const answerSimilarityScore = clampScore(row.scores.answer_correctness);
        const overallScore = clampScore(row.avg_score);

        return {
          id: row.qa_id,
          question: row.question,
          answer: row.answer,
          answerRelevancyScore,
          answerAccuracyScore,
          answerSimilarityScore,
          overallScore,
          status: getRowStatus(overallScore),
        };
      });

      if (nextEvaluationRows.length === 0) {
        throw new Error('평가 결과가 비어 있습니다.');
      }

      const nextEvaluationSummary: EvaluationSummary = {
        overallScore: clampScore(responseData.summary.overallAvgScore),
        answerRelevancyScore: clampScore(responseData.summary.answerRelevancy),
        answerAccuracyScore: clampScore(responseData.summary.faithfulness),
        answerSimilarityScore: clampScore(responseData.summary.answerCorrectness),
        evaluatedCount: responseData.summary.evaluatedCount,
      };

      setEvaluationRows(nextEvaluationRows);
      setEvaluationSummary(nextEvaluationSummary);

      updateActiveDocumentHistory({
        status: 'evaluated',
        resultFile,
        evaluationSummary: nextEvaluationSummary,
        evaluationRows: nextEvaluationRows,
      });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : '평가 실행 중 오류가 발생했습니다.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleActionClick = async () => {
    if (activeMenu === '테스트셋 생성') {
      if (generatedQuestions.length > 0) {
        handleDownloadQuestions();
        return;
      }

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
        actionLabel={headerActionLabel}
        showAction={false}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={(menu) => setActiveMenu(menu as MenuType)}
          documentHistories={documentHistories}
          activeDocumentId={activeDocumentId}
          onSelectDocumentHistory={handleSelectDocumentHistory}
          onStartNewEvaluation={handleStartNewEvaluation}
          onDeleteDocumentHistory={handleDeleteDocumentHistory}
        />

        <main
          ref={mainScrollRef}
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="flex h-full w-full flex-col px-5 py-4 lg:px-7 lg:py-5 2xl:px-9">
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
                  onQuestionTextChange={handleQuestionTextChange}
                  onRemoveQuestion={handleRemoveQuestion}
                  onDownloadQuestions={handleDownloadQuestions}
                  onMoveToEvaluation={() => setActiveMenu('성능 평가')}
                />
              ) : (
                <EvaluationResult
                  isEvaluating={isEvaluating}
                  resultFile={resultFile}
                  generatedSummary={generatedSummary}
                  evaluationMode={evaluationMode}
                  evaluationSummary={evaluationSummary}
                  evaluationRows={evaluationRows}
                  resultFileInputRef={resultFileInputRef}
                  isDraggingResult={isDraggingResult}
                  handleResultDragOver={handleResultDragOver}
                  handleResultDragLeave={handleResultDragLeave}
                  handleResultDrop={handleResultDrop}
                  handleResultFileChange={handleResultFileChange}
                  onEvaluationModeChange={handleEvaluationModeChange}
                  onRunEvaluation={handleRunEvaluation}
                  onMoveToDataset={() => setActiveMenu('테스트셋 생성')}
                  onRemoveResultFile={handleRemoveResultFile}
                  canRunEvaluation={canRunEvaluation}
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
