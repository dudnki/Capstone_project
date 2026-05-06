'use client';

import React, { useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import DatasetManager from '../components/DatasetManager';
import EvaluationResult from '../components/EvaluationResult';
import { uploadDocument, runPipeline, submitUserAnswers } from '../src/api';
import type {
  MenuType,
  QuestionItem,
  GeneratedSummary,
  EvaluationSummary,
  EvaluationRow,
  EvaluationRowStatus,
} from '../src/types';

const DOCUMENT_EXTENSIONS = ['.pdf', '.xlsx', '.txt'];
const RESULT_EXTENSIONS = ['.csv', '.xlsx'];

export default function RagEvaluationPage() {
  const [activeMenu, setActiveMenu] = useState<MenuType>('테스트셋 생성');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState(false); // ⭐ 새로 추가

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const [generatedSummary, setGeneratedSummary] = useState<GeneratedSummary | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionItem[]>([]);
  const [hasDownloadedQuestionSet, setHasDownloadedQuestionSet] = useState(false);

  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummary | null>(null);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationRow[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingResult, setIsDraggingResult] = useState(false);

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({}); // ⭐ 새로 추가
  const [documentId, setDocumentId] = useState<string>(''); // ⭐ 새로 추가

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultFileInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const canGenerateQuestions = Boolean(uploadedFile);
  const canRunEvaluation = Boolean(resultFile);
  const canSubmitAnswers = generatedQuestions.length > 0 && Object.keys(userAnswers).length > 0; // ⭐ 새로 추가

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
    return '사용자 결과 엑셀 파일을 업로드해 답변 품질을 평가합니다.';
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
    setUserAnswers({}); // ⭐ 추가
    setDocumentId(''); // ⭐ 추가
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
      console.log('========== 질문 생성 시작 ==========');

      // 1단계: 파일 업로드
      console.log('1단계: 파일 업로드 중...');
      const uploadData = await uploadDocument(uploadedFile);
      console.log('업로드 완료:', uploadData);
      setDocumentId(uploadData.saved_filename); // ⭐ 문서 ID 저장

      // 2단계: 파이프라인 실행
      console.log('2단계: 질문 생성 중...');
      const pipelineResult = await runPipeline(
        uploadData.saved_filename,
        uploadData.original_filename
      );
      console.log('질문 생성 완료:', pipelineResult);

      // 3단계: 데이터 변환
      const questions: QuestionItem[] = pipelineResult.map(
        (item: { index: number; q: string }) => ({
          id: item.index,
          text: item.q,
        })
      );

      setGeneratedQuestions(questions);
      setGeneratedSummary({
        questionCount: questions.length,
        format: 'csv',
        createdAt: new Date().toLocaleString('ko-KR'),
      });
      setHasDownloadedQuestionSet(false);

      console.log('========== 질문 생성 성공 - 총', questions.length, '개 ==========');
    } catch (error) {
      console.error('질문 생성 오류:', error);
      alert(`오류가 발생했습니다: ${(error as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ⭐ 새로 추가: 사용자 답변 제출 함수
  const handleSubmitUserAnswers = async () => {
  console.log('========== handleSubmitUserAnswers 시작 ==========');
  console.log('[HANDLER] 함수 호출됨');
  
  // 상태 확인
  console.log('[STATE] generatedQuestions:', generatedQuestions);
  console.log('[STATE] generatedQuestions 길이:', generatedQuestions?.length);
  console.log('[STATE] userAnswers:', userAnswers);
  console.log('[STATE] isSubmittingAnswers:', isSubmittingAnswers);

  // 검증
  if (!generatedQuestions || generatedQuestions.length === 0) {
    console.error('[VALIDATION] 생성된 질문이 없습니다');
    alert('생성된 질문이 없습니다');
    return;
  }

  if (!userAnswers || Object.keys(userAnswers).length === 0) {
    console.error('[VALIDATION] 사용자 답변이 없습니다');
    alert('답변을 입력해주세요');
    return;
  }

  setIsSubmittingAnswers(true);
  console.log('[STATE] isSubmittingAnswers = true로 설정됨');

  try {
    // 질문 ID 배열 생성
    const questionIds = generatedQuestions.map((q) => String(q.id));
    console.log('[PREPARE] 질문 ID 배열:', questionIds);
    console.log('[PREPARE] 질문 ID 배열 길이:', questionIds.length);

    // API 호출
    console.log('[API CALL] submitUserAnswers 호출 준비');
    console.log('[API CALL] 전달할 questionIds:', questionIds);
    console.log('[API CALL] 전달할 userAnswers:', userAnswers);

    const result = await submitUserAnswers(questionIds, userAnswers);
    
    console.log('[API CALL] submitUserAnswers 반환값:', result);
    console.log('[SUCCESS] 답변 평가 완료');
    console.log('[RESULT] 평가 결과:', result);

    // 성공 처리
    alert('답변 평가가 완료되었습니다!');
    
    // 필요하면 상태 초기화
    setUserAnswers({});
    setGeneratedQuestions([]);
    console.log('[CLEANUP] 상태 초기화 완료');

  } catch (error) {
    console.error('[ERROR] handleSubmitUserAnswers 오류 발생');
    console.error('[ERROR] 에러 객체:', error);
    console.error('[ERROR] 에러 메시지:', error instanceof Error ? error.message : String(error));
    
    alert(`답변 평가 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  } finally {
    setIsSubmittingAnswers(false);
    console.log('[STATE] isSubmittingAnswers = false로 설정됨');
    console.log('========== handleSubmitUserAnswers 종료 ==========');
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
          answer: '이 문서는 기준 문서를 바탕으로 질문을 생성하고, 사용자 결과 제출을 통해 챗봇 답변 품질을 평가하는 흐름을 설명합니다.',
          questionFitScore: 0.93,
          accuracyScore: 0.9,
          documentAlignmentScore: 0.91,
          overallScore: 0.91,
          status: getRowStatus(0.91),
        },
        {
          id: 2,
          question: '문서에서 가장 중요한 원칙 또는 단계를 설명해 주세요.',
          answer: '질문 생성 후 사용자 챗봇에서 실행한 결과를 다시 제출받아 평가하는 단계가 핵심입니다.',
          questionFitScore: 0.86,
          accuracyScore: 0.84,
          documentAlignmentScore: 0.82,
          overallScore: 0.84,
          status: getRowStatus(0.84),
        },
        {
          id: 3,
          question: '결과 제출 파일에는 어떤 항목이 포함되어야 하나요?',
          answer: 'question과 answer 컬럼이 포함된 엑셀 파일을 제출하면 됩니다.',
          questionFitScore: 0.9,
          accuracyScore: 0.88,
          documentAlignmentScore: 0.86,
          overallScore: 0.88,
          status: getRowStatus(0.88),
        },
        {
          id: 4,
          question: '이 시스템은 무엇을 중심으로 평가하나요?',
          answer: '검색 성능을 직접 평가하기보다 답변이 질문에 맞는지와 문서 내용과 일치하는지를 중심으로 봅니다.',
          questionFitScore: 0.79,
          accuracyScore: 0.76,
          documentAlignmentScore: 0.74,
          overallScore: 0.76,
          status: getRowStatus(0.76),
        },
      ];

      const average = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;

      setEvaluationRows(rows);
      setEvaluationSummary({
        overallScore: average(rows.map((row) => row.overallScore)),
        questionFitScore: average(rows.map((row) => row.questionFitScore)),
        accuracyScore: average(rows.map((row) => row.accuracyScore)),
        documentAlignmentScore: average(rows.map((row) => row.documentAlignmentScore)),
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
    setGeneratedQuestions((prev) =>
      prev.map((question) => (question.id === id ? { ...question, text } : question))
    );
  };

  const handleRemoveQuestion = (id: number) => {
    setGeneratedQuestions((prev) => {
      const next = prev.filter((question) => question.id !== id);
      setGeneratedSummary((current) =>
        current ? { ...current, questionCount: next.length } : current
      );
      return next;
    });
  };

  // ⭐ 사용자 답변 입력 핸들러
  const handleAnswerChange = (questionId: string, answer: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
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
                  userAnswers={userAnswers} // ⭐ 전달
                  onAnswerChange={handleAnswerChange} // ⭐ 전달
                  isSubmittingAnswers={isSubmittingAnswers} // ⭐ 전달
                  onSubmitAnswers={handleSubmitUserAnswers} // ⭐ 전달
                  canSubmitAnswers={canSubmitAnswers} // ⭐ 전달
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
