'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DatasetManager from '../components/DatasetManager';
import EvaluationResult from '../components/EvaluationResult';
import type {
  EvalMode,
  GenerationLevel,
  MenuType,
  QuestionItem,
  GeneratedSummary,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
} from '../src/types';

const BASE_URL = 'http://localhost:8001';
const DOCUMENT_EXTENSIONS = ['.pdf'];
const RESULT_EXTENSIONS = ['.csv'];

const getEstimatedProgress = (elapsedSeconds: number) => {
  if (elapsedSeconds <= 10) return Math.min(25, 5 + elapsedSeconds * 2);
  if (elapsedSeconds <= 60) return Math.min(60, 25 + Math.floor((elapsedSeconds - 10) * 0.7));
  if (elapsedSeconds <= 180) return Math.min(84, 60 + Math.floor((elapsedSeconds - 60) * 0.2));
  return Math.min(92, 84 + Math.floor((elapsedSeconds - 180) * 0.03));
};

const escapeCsvCell = (value: string | number) => {
  return `"${String(value).replace(/"/g, '""')}"`;
};

const getDownloadBaseName = (fileName: string) => {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
  const normalized = nameWithoutExtension
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');

  return normalized || 'rag_questions';
};

type ParsedCsvRow = Record<string, string>;

const normalizeCsvHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();

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

const findCsvHeader = (headers: string[], candidates: string[]) => {
  return headers.find((header) => candidates.includes(normalizeCsvHeader(header)));
};

const validateResultCsvAnswers = async (file: File) => {
  const csvText = await file.text();
  const rows = parseCsvText(csvText);

  if (rows.length === 0) {
    throw new Error('CSV에 평가할 답변 데이터가 없습니다.');
  }

  const headers = Object.keys(rows[0] ?? {});
  const numberHeader = findCsvHeader(headers, ['번호', 'no', 'number', 'index']);
  const qaIdHeader = findCsvHeader(headers, ['qa_id', 'qaid', 'id']);
  const answerHeader = findCsvHeader(headers, ['answer', 'user_answer', '답변']);

  if (!qaIdHeader) {
    throw new Error('qa_id 컬럼이 없습니다. 다운로드한 CSV의 qa_id 값을 유지해 주세요.');
  }

  if (!answerHeader) {
    throw new Error('답변 컬럼이 없습니다. answer 또는 답변 컬럼을 포함해 주세요.');
  }

  const missingAnswerNumbers = rows.reduce<string[]>((acc, row, index) => {
    const answerValue = row[answerHeader]?.trim();
    const isMissingAnswer = !answerValue || answerValue.toLowerCase() === 'nan';

    if (isMissingAnswer) {
      acc.push(numberHeader ? row[numberHeader]?.trim() || String(index + 1) : String(index + 1));
    }

    return acc;
  }, []);

  return { missingAnswerNumbers };
};

export default function RagEvaluationPage() {
  const [evalMode, setEvalMode] = useState<EvalMode | null>(null);
  const [generationLevel, setGenerationLevel] = useState<GenerationLevel>('medium');
  const [activeMenu, setActiveMenu] = useState<MenuType>('테스트셋 생성');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluationElapsedSeconds, setEvaluationElapsedSeconds] = useState(0);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  // ✅ 추가: 파이프라인 실행 후 받은 document_id 보관
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);

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
  const evaluationRunIdRef = useRef(0);

  const canGenerateQuestions = Boolean(uploadedFile && !generatedSummary);
  const canRunEvaluation = Boolean(resultFile && !evaluationSummary);

  // ─────────────────────────────────────────────────────────
  // 단계 계산
  // ─────────────────────────────────────────────────────────
  function getCurrentStep() {
    if (!uploadedFile) return 1;
    if (!generatedSummary) return 2;
    if (!hasDownloadedQuestionSet) return 3;
    return 5;
  }

  const currentStepValue = getCurrentStep();

  // ─────────────────────────────────────────────────────────
  // Header 표시 값
  // ─────────────────────────────────────────────────────────
  const headerDescription = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      return '기준 문서를 업로드하고 질문 세트를 생성한 뒤 필요한 질문만 검토합니다.';
    }
    return '사용자 결과 CSV 파일을 업로드해 답변 품질을 평가합니다.';
  }, [activeMenu]);

  const modeLabel = evalMode === 'user' ? '학습자 답안 평가' : 'RAG/챗봇 답변 평가';

  useEffect(() => {
    if (!isGenerating) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setGenerationElapsedSeconds(elapsedSeconds);
      setGenerationProgress(getEstimatedProgress(elapsedSeconds));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!isEvaluating) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setEvaluationElapsedSeconds(elapsedSeconds);
      setEvaluationProgress(getEstimatedProgress(elapsedSeconds));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isEvaluating]);

  useEffect(() => {
    if (!mainScrollRef.current) return;
    mainScrollRef.current.scrollTop = 0;
  }, [activeMenu]);

  // ─────────────────────────────────────────────────────────
  // 유틸
  // ─────────────────────────────────────────────────────────
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateFile = (file: File, allowedExtensions: string[]) => {
    const fileExt = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return allowedExtensions.includes(fileExt);
  };

  // ─────────────────────────────────────────────────────────
  // 상태 초기화
  // ─────────────────────────────────────────────────────────
  const resetGeneratedData = () => {
    setGeneratedSummary(null);
    setGeneratedQuestions([]);
    setHasDownloadedQuestionSet(false);
    setGenerationProgress(0);
    setGenerationElapsedSeconds(0);
    // ✅ 문서가 바뀌면 document_id도 초기화
    setCurrentDocumentId(null);
  };

  const resetEvaluationData = () => {
    setEvaluationSummary(null);
    setEvaluationRows([]);
    setEvaluationProgress(0);
    setEvaluationElapsedSeconds(0);
  };

  // ─────────────────────────────────────────────────────────
  // 파일 입력 핸들러
  // ─────────────────────────────────────────────────────────
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
      evaluationRunIdRef.current += 1;
      setIsEvaluating(false);
      setResultFile(file);
      resetEvaluationData();
    } else if (resultFileInputRef.current) {
      resultFileInputRef.current.value = '';
    }
  };

  // ─────────────────────────────────────────────────────────
  // 드래그 앤 드롭 핸들러
  // ─────────────────────────────────────────────────────────
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
      evaluationRunIdRef.current += 1;
      setIsEvaluating(false);
      setResultFile(file);
      resetEvaluationData();
    }
  };

  // ─────────────────────────────────────────────────────────
  // 파일 제거
  // ─────────────────────────────────────────────────────────
  const handleRemoveFile = () => {
    setUploadedFile(null);
    resetGeneratedData();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveResultFile = () => {
    evaluationRunIdRef.current += 1;
    setIsEvaluating(false);
    setResultFile(null);
    resetEvaluationData();
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const handleGoHome = () => {
    evaluationRunIdRef.current += 1;
    setEvalMode(null);
    setGenerationLevel('medium');
    setActiveMenu('테스트셋 생성');
    setUploadedFile(null);
    setResultFile(null);
    setCurrentDocumentId(null);
    setGeneratedSummary(null);
    setGeneratedQuestions([]);
    setHasDownloadedQuestionSet(false);
    setEvaluationSummary(null);
    setEvaluationRows([]);
    setIsEvaluating(false);
    setIsDragging(false);
    setIsDraggingResult(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────
  // 질문 생성 (테스트셋 생성 메뉴)
  // ─────────────────────────────────────────────────────────
  const handleGenerateQuestions = async () => {
  if (!uploadedFile || generatedSummary || isGenerating) return;

  setGenerationProgress(5);
  setGenerationElapsedSeconds(0);
  setIsGenerating(true);
  try {
    // ── STEP 1. 파일 업로드 ──────────────────────────────
    const formData = new FormData();
    formData.append('file', uploadedFile);

    const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(err.detail ?? '파일 업로드 실패');
    }

    const uploadData = await uploadRes.json();
    const savedFilename: string = uploadData.saved_filename;

    // ── STEP 2. 파이프라인 실행 (agentic 채택) ───────────────────────────
    const pipelineRes = await fetch(`${BASE_URL}/api/pipeline/run_agentic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saved_filename: savedFilename,
        original_filename: uploadedFile.name,
        difficulty: generationLevel,
      }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      console.error('[Pipeline 500 원문]', errText);
      let detail = '질문 생성 실패';
      try { detail = JSON.parse(errText)?.detail ?? errText; } catch { detail = errText; }
      throw new Error(`[${pipelineRes.status}] ${detail}`);
    }

    // ✅ .json()은 딱 한 번만 호출
    const pipelineData: Array<{
      index:         number;
      qa_uuid:       string;   // ✅ string (UUID)
      document_uuid: string;   // ✅ document_id가 아니라 document_uuid
      q:             string;
      doc:           string;
      dtype:         string;
      answer:        string;
      score:         number;
      faithfulness:  number;
      answer_relevancy: number;
    }> = await pipelineRes.json();

    // ── STEP 3. document_uuid 추출 ────────────────────────
    // ✅ 필드명 document_uuid로 수정
    const docId: string | null =
      pipelineData.length > 0 ? pipelineData[0].document_uuid ?? null : null;

    if (docId) {
      setCurrentDocumentId(docId);
    }

    // ── STEP 4. 프론트 상태 업데이트 ─────────────────────
    // ✅ qa_uuid가 string이므로 id 타입도 string으로 매핑
    const questions: QuestionItem[] = pipelineData.map((item) => ({
      id:   item.qa_uuid, // string UUID
      text: item.q,
    }));

    setGeneratedQuestions(questions);
    setGeneratedSummary({
      questionCount: questions.length,
      format:        'csv',
      createdAt:     new Date().toLocaleString('ko-KR'),
    });
    setHasDownloadedQuestionSet(false);
    setGenerationProgress(100);

  } catch (error) {
    setGenerationProgress(0);
    console.error('질문 생성 오류:', error);
    alert(error instanceof Error ? error.message : '질문 생성 중 오류가 발생했습니다.');
  } finally {
    setIsGenerating(false);
  }
};


  // ─────────────────────────────────────────────────────────
  // 질문 다운로드
  // ─────────────────────────────────────────────────────────
  const handleDownloadQuestions = () => {
    if (generatedQuestions.length === 0) return;

    const baseName = uploadedFile ? getDownloadBaseName(uploadedFile.name) : 'rag_questions';
    const csv = `\uFEFF${[
      '번호,qa_id,질문,답변',
      ...generatedQuestions.map(
        (q, index) =>
          [
            escapeCsvCell(index + 1),
            escapeCsvCell(q.id),
            escapeCsvCell(q.text),
            escapeCsvCell(''),
          ].join(',')
      ),
    ].join('\n')}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}_questions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setHasDownloadedQuestionSet(true);
  };

  // ─────────────────────────────────────────────────────────
  // 질문 수정 / 삭제
  // ─────────────────────────────────────────────────────────
  const handleUpdateQuestion = (id: string, text: string) => {
    setGeneratedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, text } : q)),
    );
  };

  const handleRemoveQuestion = (id: string) => {
    setGeneratedQuestions((prev) => {
      const next = prev.filter((q) => q.id !== id);
      setGeneratedSummary((cur) =>
        cur ? { ...cur, questionCount: next.length } : cur,
      );
      return next;
    });
  };

  // ─────────────────────────────────────────────────────────
  // ✅ 평가 실행 (성능 평가 메뉴)
  //    - 엔드포인트: POST /api/evaluations/submit
  //    - payload에 document_id 포함
  // ─────────────────────────────────────────────────────────
  const handleRunEvaluation = async () => {
    if (!resultFile || evaluationSummary || isEvaluating) return;

    try {
      const { missingAnswerNumbers } = await validateResultCsvAnswers(resultFile);

      if (missingAnswerNumbers.length > 0) {
        const missingQuestionLabel = missingAnswerNumbers.join(', ');
        const shouldSubmit = window.confirm(
          `${missingQuestionLabel}번 문항에 답을 적지 않으셨습니다. 정말로 제출하시겠습니까?`,
        );

        if (!shouldSubmit) return;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'CSV 답변 검증 중 오류가 발생했습니다.');
      return;
    }

    setEvaluationProgress(5);
    setEvaluationElapsedSeconds(0);
    const runId = evaluationRunIdRef.current + 1;
    evaluationRunIdRef.current = runId;
    setIsEvaluating(true);
    try {
      // ── STEP 1. 결과 파일 업로드 ─────────────────────────
      const formData = new FormData();
      formData.append('file', resultFile);

      const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.detail ?? '결과 파일 업로드 실패');
      }

      const uploadData = await uploadRes.json();
      const savedFilename: string = uploadData.saved_filename;

      if (evaluationRunIdRef.current !== runId) return;

      // ── STEP 2. 평가 실행 ────────────────────────────────
      // ✅ 엔드포인트: /submit, payload에 document_id 포함
      const evalRes = await fetch(`${BASE_URL}/api/evaluations/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saved_filename:    savedFilename,
          original_filename: resultFile.name,
          document_id:       currentDocumentId ?? '',
          mode:              evalMode === 'user' ? 'human' : 'model',
        }),
      });

      if (!evalRes.ok) {
        const err = await evalRes.json();
        throw new Error(err.detail ?? '평가 실행 실패');
      }

      // ── STEP 3. 응답 파싱 ────────────────────────────────
      const evalData: {
        success: boolean;
        summary: {
          evaluatedCount:    number;
          overallAvgScore:   number;
          faithfulness:      number;
          answerRelevancy:   number;
          answerCorrectness: number;
          overallFeedback?: {
            strengths: string;
            direction: string;
          };
        };
        rows: Array<{
          qa_id:     string;
          question:  string;
          answer:    string;
          scores: {
            faithfulness:       number;
            answer_relevancy:   number;
            answer_correctness: number;
          };
          avg_score: number;
          feedback?: {
            reasoning:    string;
            improvements: string;
            advice:       string;
          };
          score_reasons?: {
            faithfulness?:       string;
            answer_relevancy?:   string;
            answer_correctness?: string;
          };
        }>;
      } = await evalRes.json();

      if (evaluationRunIdRef.current !== runId) return;

      // ── STEP 4. 프론트 타입으로 변환 ─────────────────────
      const summary: EvaluationSummary = {
        evaluatedCount:    evalData.summary.evaluatedCount,
        overallAvgScore:   evalData.summary.overallAvgScore,
        faithfulness:      evalData.summary.faithfulness,
        answerRelevancy:   evalData.summary.answerRelevancy,
        answerCorrectness: evalData.summary.answerCorrectness,
        ...(evalData.summary.overallFeedback && {
          overallFeedback: evalData.summary.overallFeedback,
        }),
      };

      const rows: EvaluationRow[] = evalData.rows.map((row) => ({
        id:       row.qa_id,
        question: row.question,
        answer:   row.answer,
        scores: {
          faithfulness:       row.scores.faithfulness,
          answer_relevancy:   row.scores.answer_relevancy,
          answer_correctness: row.scores.answer_correctness,
        },
        avg_score: row.avg_score,
        ...(row.feedback && { feedback: row.feedback }),
        ...(row.score_reasons && { score_reasons: row.score_reasons }),
      }));

      setEvaluationSummary(summary);
      setEvaluationRows(rows);
      setEvaluationProgress(100);
    } catch (error) {
      if (evaluationRunIdRef.current !== runId) return;
      setEvaluationProgress(0);
      console.error('평가 오류:', error);
      alert(error instanceof Error ? error.message : '평가 중 오류가 발생했습니다.');
    } finally {
      if (evaluationRunIdRef.current === runId) {
        setIsEvaluating(false);
      }
    }
  };

  // ─────────────────────────────────────────────────────────
  // Header 액션 통합
  // ─────────────────────────────────────────────────────────
  const handleActionClick = async () => {
    if (activeMenu === '테스트셋 생성') {
      if (!canGenerateQuestions || isGenerating) return;
      await handleGenerateQuestions();
    } else {
      if (!canRunEvaluation || isEvaluating) return;
      await handleRunEvaluation();
    }
  };

  // ─────────────────────────────────────────────────────────
  // 스크롤 복원
  // ─────────────────────────────────────────────────────────
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

  const handleMenuChange = (menu: MenuType) => {
    setActiveMenu(menu);
    requestAnimationFrame(() => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
      }
    });
  };

  // ─────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────

  if (evalMode === null) {
    return (
      <div className="min-h-screen bg-[#eef2f7] text-slate-900">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-[0_1px_4px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.16)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900">Pipeline Architect</p>
              <p className="mt-0.5 text-xs text-slate-500">RAG 평가 워크플로우</p>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            평가 방식 선택
          </span>
        </header>

        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-10">
          <div className="grid w-full max-w-[1040px] gap-5 lg:grid-cols-[0.96fr_1.04fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
                RAG Evaluation
              </p>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                평가 워크스페이스 시작
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                기준 문서를 테스트셋으로 만들고, 제출된 답변 CSV를 같은 흐름 안에서
                평가합니다. 먼저 평가 대상을 선택하면 필요한 업로드 형식과 진행 단계가
                정리됩니다.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  ['01', '기준 문서 업로드', 'PDF 기반 질문 세트를 생성합니다.'],
                  ['02', '답변 CSV 제출', 'qa_id와 답변을 기준으로 평가합니다.'],
                  ['03', '결과 확인', '종합 점수와 세부 근거를 확인합니다.'],
                ].map(([step, title, description]) => (
                  <div
                    key={step}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
                      {step}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-950">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600">
                Mode Select
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
                평가 방식을 선택하세요
              </h2>

              <div className="mt-8 space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    setEvalMode('user');
                    setActiveMenu('테스트셋 생성');
                  }}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-[0_16px_38px_rgba(37,99,235,0.14)]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="4" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-950">학습자 답안 평가</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                        채점 피드백
                      </span>
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">
                      학습자가 작성한 답안 CSV를 업로드해 점수, 채점 근거, 개선 방향을 확인합니다.
                    </span>
                  </span>
                  <svg
                    className="shrink-0 text-slate-400 transition-colors group-hover:text-blue-700"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEvalMode('model');
                    setActiveMenu('테스트셋 생성');
                  }}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-[0_16px_38px_rgba(16,185,129,0.14)]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-700">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 19.5V5a2 2 0 0 1 2-2h11l3 3v13.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" />
                      <path d="M17 3v4h4" />
                      <path d="M8 13h8" />
                      <path d="M8 17h5" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-950">RAG/챗봇 답변 평가</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-700">
                        모델 결과
                      </span>
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">
                      RAG 또는 챗봇이 생성한 답변 CSV를 업로드해 질문 이해도, 내용 완성도, 문서 일치도를 산출합니다.
                    </span>
                  </span>
                  <svg
                    className="shrink-0 text-slate-400 transition-colors group-hover:text-emerald-700"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        activeMenu={activeMenu}
        evalMode={evalMode}
        isGenerating={isGenerating}
        isEvaluating={isEvaluating}
        onActionClick={handleActionClick}
        onHomeClick={handleGoHome}
        isActionDisabled={
          activeMenu === '테스트셋 생성' ? !canGenerateQuestions : !canRunEvaluation
        }
        isActionComplete={
          activeMenu === '테스트셋 생성' ? Boolean(generatedSummary) : Boolean(evaluationSummary)
        }
        actionProgress={activeMenu === '테스트셋 생성' ? generationProgress : evaluationProgress}
        modeLabel={modeLabel}
        description={headerDescription}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={(menu) => handleMenuChange(menu as MenuType)}
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
                  evalMode={evalMode}
                  generationLevel={generationLevel}
                  isGenerating={isGenerating}
                  uploadedFile={uploadedFile}
                  generatedSummary={generatedSummary}
                  generatedQuestions={generatedQuestions}
                  currentStep={currentStepValue}
                  generationProgress={generationProgress}
                  generationElapsedSeconds={generationElapsedSeconds}
                  isDragging={isDragging}
                  fileInputRef={fileInputRef}
                  handleDragOver={handleDragOver}
                  handleDragLeave={handleDragLeave}
                  handleDrop={handleDrop}
                  handleFileChange={handleFileChange}
                  formatFileSize={formatFileSize}
                  onGenerationLevelChange={setGenerationLevel}
                  onRemoveFile={handleRemoveFile}
                  onGenerateQuestions={handleGenerateQuestions}
                  onDownloadQuestions={handleDownloadQuestions}
                  onMoveToEvaluation={() => handleMenuChange('성능 평가')}
                  onUpdateQuestion={handleUpdateQuestion}
                  onRemoveQuestion={handleRemoveQuestion}
                />
              ) : (
                <EvaluationResult
                  evalMode={evalMode ?? 'model'}
                  isEvaluating={isEvaluating}
                  resultFile={resultFile}
                  evaluationSummary={evaluationSummary}
                  evaluationRows={evaluationRows}
                  evaluationProgress={evaluationProgress}
                  evaluationElapsedSeconds={evaluationElapsedSeconds}
                  resultFileInputRef={resultFileInputRef}
                  isDraggingResult={isDraggingResult}
                  handleResultDragOver={handleResultDragOver}
                  handleResultDragLeave={handleResultDragLeave}
                  handleResultDrop={handleResultDrop}
                  handleResultFileChange={handleResultFileChange}
                  onRemoveResultFile={handleRemoveResultFile}
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
