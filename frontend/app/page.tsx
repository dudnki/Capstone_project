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

const BASE_URL = 'http://localhost:8001';
const DOCUMENT_EXTENSIONS = ['.pdf', '.xlsx'];
const RESULT_EXTENSIONS = ['.csv', '.xlsx'];

export default function RagEvaluationPage() {
  const [activeMenu, setActiveMenu] = useState<MenuType>('테스트셋 생성');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

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

  const canGenerateQuestions = Boolean(uploadedFile);
  const canRunEvaluation = Boolean(resultFile);

  // ─────────────────────────────────────────────────────────
  // 단계 계산
  // ─────────────────────────────────────────────────────────
  function getCurrentStep() {
    if (!uploadedFile) return 1;
    if (!generatedSummary) return 2;
    if (!hasDownloadedQuestionSet) return 3;
    if (!resultFile) return 4;
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
    return '사용자 결과 엑셀 파일을 업로드해 답변 품질을 평가합니다.';
  }, [activeMenu]);

  const headerStepLabel = useMemo(() => {
    if (activeMenu === '테스트셋 생성') {
      const labels = [
        '1단계 문서 업로드',
        '2단계 질문 생성',
        '3단계 질문 검토',
        '4단계 질문 다운로드',
      ];
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

  // ─────────────────────────────────────────────────────────
  // 유틸
  // ─────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  // 상태 초기화
  // ─────────────────────────────────────────────────────────
  const resetGeneratedData = () => {
    setGeneratedSummary(null);
    setGeneratedQuestions([]);
    setHasDownloadedQuestionSet(false);
    // ✅ 문서가 바뀌면 document_id도 초기화
    setCurrentDocumentId(null);
  };

  const resetEvaluationData = () => {
    setEvaluationSummary(null);
    setEvaluationRows([]);
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
    setResultFile(null);
    resetEvaluationData();
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────
  // 질문 생성 (테스트셋 생성 메뉴)
  // ─────────────────────────────────────────────────────────
  const handleGenerateQuestions = async () => {
  if (!uploadedFile) return;

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

    // ── STEP 2. 파이프라인 실행 ───────────────────────────
    const pipelineRes = await fetch(`${BASE_URL}/api/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saved_filename: savedFilename,
        original_filename: uploadedFile.name,
      }),
    });

    if (!pipelineRes.ok) {
      const err = await pipelineRes.json();
      throw new Error(err.detail ?? '질문 생성 실패');
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

  } catch (error) {
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

    const nowDate = new Date().toISOString().slice(0, 10);
    const csv = [
      'qa_id,question,answer',
      ...generatedQuestions.map(
        (q) => `"${String(q.id)}","${q.text.replace(/"/g, '""')}",""`
      ),
    ].join('\n');

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

  // ─────────────────────────────────────────────────────────
  // 질문 수정 / 삭제
  // ─────────────────────────────────────────────────────────
  const handleUpdateQuestion = (id: number, text: string) => {
    setGeneratedQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, text } : q)),
    );
  };

  const handleRemoveQuestion = (id: number) => {
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
    if (!resultFile) return;

    // document_id가 없으면 경고
    if (!currentDocumentId) {
      alert(
        '평가할 문서 정보가 없습니다.\n먼저 "테스트셋 생성" 메뉴에서 질문을 생성해 주세요.',
      );
      return;
    }

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

      // ── STEP 2. 평가 실행 ────────────────────────────────
      // ✅ 엔드포인트: /submit, payload에 document_id 포함
      const evalRes = await fetch(`${BASE_URL}/api/evaluations/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saved_filename:    savedFilename,
          original_filename: resultFile.name,
          document_id:       currentDocumentId,
          mode:              pipelineMode,
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
        }>;
      } = await evalRes.json();

      // ── STEP 4. 프론트 타입으로 변환 ─────────────────────
      const summary: EvaluationSummary = {
        evaluatedCount:    evalData.summary.evaluatedCount,
        overallAvgScore:   evalData.summary.overallAvgScore,
        faithfulness:      evalData.summary.faithfulness,
        answerRelevancy:   evalData.summary.answerRelevancy,
        answerCorrectness: evalData.summary.answerCorrectness,
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
        // EvaluationRowStatus가 필요하면 아래 주석 해제
        // status: row.avg_score >= 0.7 ? 'pass' : 'fail' as EvaluationRowStatus,
      }));

      setEvaluationSummary(summary);
      setEvaluationRows(rows);
    } catch (error) {
      console.error('평가 오류:', error);
      alert(error instanceof Error ? error.message : '평가 중 오류가 발생했습니다.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Header 액션 통합
  // ─────────────────────────────────────────────────────────
  const handleActionClick = async () => {
    if (activeMenu === '테스트셋 생성') {
      await handleGenerateQuestions();
    } else {
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

  // ─────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        activeMenu={activeMenu}
        isGenerating={isGenerating}
        isEvaluating={isEvaluating}
        onActionClick={handleActionClick}
        isActionDisabled={
          activeMenu === '테스트셋 생성' ? !canGenerateQuestions : !canRunEvaluation
        }
        description={headerDescription}
        currentStepLabel={headerStepLabel}
        primaryStatus={headerPrimaryStatus}
        secondaryStatus={headerSecondaryStatus}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeMenu={activeMenu}
          setActiveMenu={(menu) => setActiveMenu(menu as MenuType)}
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
