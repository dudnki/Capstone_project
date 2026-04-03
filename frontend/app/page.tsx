'use client';

import React, { useState, useRef, useEffect } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import EvaluationResult from '../components/EvaluationResult';
import DatasetManager from '../components/DatasetManager';
import ReviewManager from '../components/ReviewManager';

const MOCK_RESULTS = [
  { id: 1, q: "OIDC 기반의 멀티 테넌트 환경에서 토큰 유효성 검증 시 고려해야 할 보안 요소는?", doc: "auth_spec_v2.pdf", dtype: "pdf", color: "#b91c1c", bg: "#fef2f2", answer: "다음 중 OIDC 멀티 테넌트 환경에서 토큰 검증 시 반드시 확인해야 하는 클레임(claim)으로 올바른 것은?", score: 0.95 },
  { id: 2, q: "벡터 검색 엔드포인트 타임아웃 발생 시 적절한 재시도 전략은 무엇인가?", doc: "infra_config.json", dtype: "json", color: "#c2410c", bg: "#fff7ed", answer: "벡터 DB 조회 중 타임아웃이 반복 발생할 때, 시스템 안정성을 위해 가장 권장되는 재시도(Retry) 패턴은?", score: 0.32 },
  { id: 3, q: "Python 3.8 환경에서 SDK 버전 호환성 문제를 해결하는 방법은?", doc: "release_notes.md", dtype: "md", color: "#1d4ed8", bg: "#eff6ff", answer: "Python 3.8에서 최신 SDK 설치 시 의존성 충돌이 발생했을 때, 가장 먼저 시도해야 할 조치는?", score: 0.68 },
  { id: 4, q: "민감 데이터 마스킹 정책의 적용 범위와 예외 처리 기준은?", doc: "privacy_policy.pdf", dtype: "pdf", color: "#b91c1c", bg: "#fef2f2", answer: "개인정보보호법 기준에 따라 로그 데이터 내 민감 정보를 마스킹 처리할 때, 예외적으로 원문 보존이 허용되는 경우는?", score: 0.91 },
];

export default function RagEvaluationPage() {
  const [activeMenu, setActiveMenu] = useState('평가결과');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [selectedItemForReview, setSelectedItemForReview] = useState<any | null>(null);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' Bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const validateFile = (file: File) => {
    const MAX_SIZE = 1024 * 1024 * 1024;
    const ALLOWED_EXTS = ['.pdf', '.csv', '.txt', '.json', '.jsonl', '.md'];

    if (file.size > MAX_SIZE) {
      setErrorMessage("파일 용량이 1GB를 초과할 수 없습니다.");
      return false;
    }

    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(fileExt)) {
      setErrorMessage(`지원하지 않는 파일 형식입니다. (${ALLOWED_EXTS.join(', ').toUpperCase()} 지원)`);
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) setUploadedFile(file);
      else if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) setUploadedFile(file);
    }
  };

  const handleRunPipeline = async () => {
    if (!uploadedFile) return;
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile); 

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('백엔드 서버 연동 실패');
      }

      const resultData = await response.json();
      console.log('백엔드 분석 완료:', resultData);
      
      setIsAnalyzing(false);
      setShowResults(true);

    } catch (error) {
      console.error('파이프라인 실행 에러:', error);
      setErrorMessage("서버와 통신하는 중 오류가 발생했습니다. 백엔드가 켜져 있는지 확인하세요.");
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setUploadedFile(null);
    setShowResults(false);
    setIsAnalyzing(false);
    setErrorMessage(null);
    setIsFilterOpen(false);
    setSelectedFilters([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleFilter = (filterType: string) => {
    if (filterType === '') {
      setSelectedFilters([]);
      return;
    }
    setSelectedFilters(prev =>
      prev.includes(filterType)
        ? prev.filter(f => f !== filterType)
        : [...prev, filterType]
    );
  };

  const filteredResults = MOCK_RESULTS.filter(row => {
    if (selectedFilters.length === 0) return true;

    return selectedFilters.some(filter => {
      if (filter === 'excellent') return row.score >= 0.8;
      if (filter === 'good') return row.score >= 0.6 && row.score < 0.8;
      if (filter === 'danger') return row.score < 0.6;
      return false;
    });
  });

  const downloadCSV = () => {
    const headers = ['ID', '사용자 질문', '참조 문서', '생성 답변', '평가 점수'];

    const rows = filteredResults.map(row => {
      const escapeText = (text: string) => `"${String(text).replace(/"/g, '""')}"`;
      return [
        row.id,
        escapeText(row.q),
        escapeText(uploadedFile?.name || row.doc),
        escapeText(row.answer),
        row.score
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `rag_evaluation_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col text-slate-900 font-sans relative" style={{ background: '#f8fafc', overflow: 'hidden' }}>

      {errorMessage && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 flex items-center gap-2 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-rose-200" style={{ background: '#fff1f2' }}>
          <div className="flex items-center justify-center rounded-full bg-rose-100" style={{ width: '20px', height: '20px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#be123c' }}>{errorMessage}</span>
        </div>
      )}

      <Header showResults={showResults} isAnalyzing={isAnalyzing} uploadedFile={uploadedFile} handleReset={handleReset} handleRunPipeline={handleRunPipeline} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} showResults={showResults} uploadedFile={uploadedFile} />

        {/* 💡 수정한 부분: style={{ padding: '28px' }} 로 하단 공백 400px 삭제! */}
        <main className="flex-1 overflow-y-scroll" style={{ padding: '28px' }}>
          {activeMenu === '평가결과' && (
            <EvaluationResult 
              showResults={showResults} isAnalyzing={isAnalyzing} uploadedFile={uploadedFile}
              fileInputRef={fileInputRef} isDragging={isDragging} isFilterOpen={isFilterOpen}
              setIsFilterOpen={setIsFilterOpen} selectedFilters={selectedFilters} toggleFilter={toggleFilter}
              downloadCSV={downloadCSV} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave}
              handleDrop={handleDrop} handleFileChange={handleFileChange} setUploadedFile={setUploadedFile}
              formatFileSize={formatFileSize} setSelectedItemForReview={setSelectedItemForReview} filteredResults={filteredResults}
            />
          )}

          {activeMenu === '데이터셋관리' && (
            <DatasetManager uploadedFile={uploadedFile} setUploadedFile={setUploadedFile} formatFileSize={formatFileSize} />
          )}

          {activeMenu === '검수관리' && (
            <ReviewManager showResults={showResults} MOCK_RESULTS={MOCK_RESULTS} uploadedFile={uploadedFile} selectedItemForReview={selectedItemForReview} setSelectedItemForReview={setSelectedItemForReview} />
          )}
        </main>
      </div>
    </div>
  );
}