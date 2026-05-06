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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const DOCUMENT_EXTENSIONS = ['.pdf'];
const RESULT_EXTENSIONS = ['.csv'];

type BackendMeta = {
  documentId: string | null;
  qaIdByQuestionId: Record<number, string>;
  questionByQaId: Record<string, string>;
};

type ParsedCsvRow = Record<string, string>;

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

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const parseCsvText = (csvText: string): ParsedCsvRow[] => {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<ParsedCsvRow>((acc, header, index) => {
      acc[header] = cells[index] ?? '';
      return acc;
    }, {});
  });
};

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
  const [backendMetaByHistoryId, setBackendMetaByHistoryId] = useState<Record<string, BackendMeta>>({});

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
      return '기준 PDF 문서를 업로드하고 질문 세트를 생성한 뒤 CSV로 내려받습니다.';
    }

    return '사용자 결과 CSV 파일을 업로드해 답변 품질을 평가합니다.';
  }, [activeMenu]);

  const headerStepLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      const labels = ['1단계 PDF 업로드', '2단계 질문 생성', '3단계 질문 다운로드'];
      return labels[Math.min(currentStepValue, 3) - 1];
    }

    return evaluationSummary ? '평가 결과 확인' : '결과 CSV 업로드';
  }, [activeMenu, currentStepValue, evaluationSummary]);

  const headerPrimaryStatus = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return uploadedFile ? `문서 ${uploadedFile.name}` : 'PDF 미업로드';
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
        qaIdByQuestionId: {},
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

    const documentId =
      items.find((item) => getString(item, 'document_uuid') || getString(item, 'document_id'))
        ? getString(
            items.find((item) => getString(item, 'document_uuid') || getString(item, 'document_id')) ?? {},
            'document_uuid',
          ) ??
          getString(
            items.find((item) => getString(item, 'document_uuid') || getString(item, 'document_id')) ?? {},
            'document_id',
          ) ??
          null
        : null;

    const questions: QuestionItem[] = items
      .map((item, index) => ({
        id: index + 1,
        text: getString(item, 'q') ?? getString(item, 'question') ?? '',
      }))
      .filter((item) => item.text.trim().length > 0);

    const qaIdByQuestionId = items.reduce<Record<number, string>>((acc, item, index) => {
      const qaId = getString(item, 'qa_uuid') ?? getString(item, 'qa_id');
      if (qaId) acc[index + 1] = qaId;
      return acc;
    }, {});

    const questionByQaId = items.reduce<Record<string, string>>((acc, item) => {
      const qaId = getString(item, 'qa_uuid') ?? getString(item, 'qa_id');
      const question = getString(item, 'q') ?? getString(item, 'question');

      if (qaId && question) acc[qaId] = question;
      return acc;
    }, {});

    return {
      documentId,
      questions,
      qaIdByQuestionId,
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

      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('PDF 업로드에 실패했습니다.');
      }

      const uploadData = await uploadResponse.json();

      if (!isRecord(uploadData)) {
        throw new Error('업로드 응답 형식이 올바르지 않습니다.');
      }

      const savedFilename = getString(uploadData, 'saved_filename');
      const originalFilename = getString(uploadData, 'original_filename') ?? uploadedFile.name;

      if (!savedFilename) {
        throw new Error('백엔드에서 saved_filename을 받지 못했습니다.');
      }

      const pipelineResponse = await fetch(`${API_BASE_URL}/api/pipeline/run`, {
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
        throw new Error('질문 생성에 실패했습니다.');
      }

      const pipelineData = await pipelineResponse.json();
      const normalized = normalizePipelineResponse(pipelineData);

      if (normalized.questions.length === 0) {
        throw new Error('생성된 질문이 없습니다.');
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
          qaIdByQuestionId: normalized.qaIdByQuestionId,
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

    const activeMeta = activeDocumentId ? backendMetaByHistoryId[activeDocumentId] : null;
    const nowDate = new Date().toISOString().slice(0, 10);
    const headers = ['qa_id', 'question'];

    const rows = generatedQuestions.map((question) => {
      const qaId = activeMeta?.qaIdByQuestionId[question.id] ?? '';
      return [escapeCsvCell(qaId), escapeCsvCell(question.text)].join(',');
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

  const buildUserAnswersFromCsv = async () => {
    if (!resultFile) return [];

    const activeMeta = activeDocumentId ? backendMetaByHistoryId[activeDocumentId] : null;

    if (!activeMeta?.documentId) {
      throw new Error('문서 ID가 없습니다. 질문 생성을 다시 실행해 주세요.');
    }

    const csvText = await resultFile.text();
    const rows = parseCsvText(csvText);

    if (rows.length === 0) {
      throw new Error('CSV에 제출할 답변 데이터가 없습니다.');
    }

    const questionToQaId = generatedQuestions.reduce<Record<string, string>>((acc, question) => {
      const qaId = activeMeta.qaIdByQuestionId[question.id];
      if (qaId) acc[question.text.trim()] = qaId;
      return acc;
    }, {});

    return rows.map((row, index) => {
      const qaId = row.qa_id || row.qaId || row.id || questionToQaId[(row.question ?? '').trim()];
      const answer = row.answer ?? row.user_answer ?? '';

      if (!qaId) {
        throw new Error(`${index + 1}번째 행에서 qa_id를 찾을 수 없습니다.`);
      }

      if (!answer.trim()) {
        throw new Error(`${index + 1}번째 행의 answer가 비어 있습니다.`);
      }

      return {
        qa_id: qaId,
        answer,
      };
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
      alert('문서 ID가 없습니다. 질문 생성을 다시 실행해 주세요.');
      return;
    }

    setIsEvaluating(true);

    try {
      const userAnswers = await buildUserAnswersFromCsv();

      const response = await fetch(`${API_BASE_URL}/api/evaluations/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: activeMeta.documentId,
          user_answers: userAnswers,
        }),
      });

      if (!response.ok) {
        throw new Error('평가 실행에 실패했습니다.');
      }

      const responseData = await response.json();

      if (!isRecord(responseData) || !Array.isArray(responseData.results)) {
        throw new Error('평가 응답 형식이 올바르지 않습니다.');
      }

      const csvText = await resultFile.text();
      const parsedRows = parseCsvText(csvText);

      const questionToQaId = generatedQuestions.reduce<Record<string, string>>((acc, question) => {
        const qaId = activeMeta.qaIdByQuestionId[question.id];
        if (qaId) acc[question.text.trim()] = qaId;
        return acc;
      }, {});

      const answerByQaId = parsedRows.reduce<Record<string, string>>((acc, row) => {
        const qaId = row.qa_id || row.qaId || row.id || questionToQaId[(row.question ?? '').trim()];
        if (qaId) acc[qaId] = row.answer ?? row.user_answer ?? '';
        return acc;
      }, {});

      const resultItems = responseData.results.filter(isRecord);

      const nextEvaluationRows: EvaluationRow[] = resultItems.map((item, index) => {
        const qaId = getString(item, 'qa_id') ?? '';
        const answerRelevancyScore = clampScore(getNumber(item, 'answer_relevancy') ?? 0);
        const answerAccuracyScore = clampScore(getNumber(item, 'faithfulness') ?? 0);
        const answerSimilarityScore = clampScore(
          getNumber(item, 'answer_correctness') ??
            getNumber(item, 'answer_similarity') ??
            (answerRelevancyScore + answerAccuracyScore) / 2,
        );
        const overallScore = clampScore(
          getNumber(item, 'score') ??
            (answerRelevancyScore + answerAccuracyScore + answerSimilarityScore) / 3,
        );

        return {
          id: index + 1,
          question: activeMeta.questionByQaId[qaId] ?? generatedQuestions[index]?.text ?? '',
          answer: answerByQaId[qaId] ?? '',
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

      const average = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;

      const nextEvaluationSummary: EvaluationSummary = {
        overallScore: average(nextEvaluationRows.map((row) => row.overallScore)),
        answerRelevancyScore: average(nextEvaluationRows.map((row) => row.answerRelevancyScore)),
        answerAccuracyScore: average(nextEvaluationRows.map((row) => row.answerAccuracyScore)),
        answerSimilarityScore: average(nextEvaluationRows.map((row) => row.answerSimilarityScore)),
        evaluatedCount: nextEvaluationRows.length,
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
          onStartNewEvaluation={handleStartNewEvaluation}
          onDeleteDocumentHistory={handleDeleteDocumentHistory}
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