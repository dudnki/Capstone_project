'use client';

import React, { useState, useRef, useEffect } from 'react';

// 💡 가상의 분석 결과 데이터
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

  // ✨ 상세 검수 모달 상태
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
    const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
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

  const handleRunPipeline = () => {
    if (!uploadedFile) return;
    setIsAnalyzing(true);
    setTimeout(() => { setIsAnalyzing(false); setShowResults(true); }, 2500);
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

  const getScoreStyle = (score: number) => {
    if (score >= 0.8) return { bar: "#34d399", text: "#059669" };
    if (score >= 0.6) return { bar: "#fbbf24", text: "#d97706" };
    return { bar: "#f87171", text: "#e11d48" };
  };

  const toggleFilter = (filterType: string) => {
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

      {/* 토스트 에러 메시지 */}
      {errorMessage && (
        <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 flex items-center gap-2 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-rose-200" style={{ background: '#fff1f2' }}>
          <div className="flex items-center justify-center rounded-full bg-rose-100" style={{ width: '20px', height: '20px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#be123c' }}>{errorMessage}</span>
        </div>
      )}

      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header className="relative z-[60] flex-shrink-0 flex items-center justify-between bg-white" style={{ height: '54px', padding: '0 24px', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-lg text-white text-[10px] font-bold" style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg,#0f766e,#14b8a6)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1 }}>Pipeline Architect</div>
            <div className="font-mono" style={{ fontSize: '8px', color: '#14b8a6', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '1px' }}>RAG Intelligence</div>
          </div>
        </div>

        {/* 💡 상단 중앙 메뉴 삭제됨 */}

        <div className="flex items-center">
          {showResults ? (
            <button onClick={handleReset} className="flex items-center gap-2 rounded-xl font-semibold text-[13px] transition-all text-white cursor-pointer hover:-translate-y-[1px]" style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#0f766e,#0d9488)', boxShadow: '0 4px 14px rgba(13,148,136,0.35)', border: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><polyline points="21 3 21 8 16 8" /></svg> 새 문서 평가하기
            </button>
          ) : (
            <button disabled={!uploadedFile || isAnalyzing} onClick={handleRunPipeline} className={`flex items-center gap-2 rounded-xl font-semibold text-[13px] transition-all ${uploadedFile && !isAnalyzing ? "text-white cursor-pointer hover:-translate-y-[1px]" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`} style={uploadedFile && !isAnalyzing ? { padding: '9px 20px', background: 'linear-gradient(135deg,#0f766e,#0d9488)', boxShadow: '0 4px 14px rgba(13,148,136,0.35)', border: 'none' } : { padding: '9px 20px', border: 'none' }}>
              {!isAnalyzing && <span className={`w-1.5 h-1.5 rounded-full inline-block ${uploadedFile ? 'animate-pulse' : ''}`} style={{ background: uploadedFile ? '#5eead4' : '#94a3b8' }}></span>}
              {isAnalyzing ? '분석 중...' : 'Run Pipeline'}
            </button>
          )}
        </div>
      </header>

      {/* ════════════════════════ BODY ════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* --- SIDEBAR --- */}
        <aside className="flex flex-col bg-white flex-shrink-0 overflow-y-auto z-[40]" style={{ width: '196px', borderRight: '1px solid #e2e8f0', padding: '16px 10px', boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '9px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 8px', marginBottom: '6px' }}>메뉴</div>

          <div onClick={() => setActiveMenu('평가결과')} className={`flex items-center gap-2.5 rounded-xl relative cursor-pointer transition-all ${activeMenu !== '평가결과' ? 'hover:bg-slate-50 hover:text-slate-700' : ''}`} style={activeMenu === '평가결과' ? { padding: '9px 10px', background: '#f0fdfa', color: '#0f766e', border: '1px solid rgba(15,118,110,0.15)', fontSize: '13px', fontWeight: 600 } : { padding: '9px 10px', color: '#94a3b8', border: '1px solid transparent', fontSize: '13px', fontWeight: 500 }}>
            {activeMenu === '평가결과' && <div style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '20px', background: '#0f766e', borderRadius: '0 3px 3px 0' }}></div>}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
            <span className="flex-1">평가 결과</span>
          </div>

          <div onClick={() => setActiveMenu('데이터셋관리')} className={`flex items-center gap-2.5 rounded-xl mt-0.5 relative cursor-pointer transition-all ${activeMenu !== '데이터셋관리' ? 'hover:bg-slate-50 hover:text-slate-700' : ''}`} style={activeMenu === '데이터셋관리' ? { padding: '9px 10px', background: '#f0fdfa', color: '#0f766e', border: '1px solid rgba(15,118,110,0.15)', fontSize: '13px', fontWeight: 600 } : { padding: '9px 10px', color: '#94a3b8', border: '1px solid transparent', fontSize: '13px', fontWeight: 500 }}>
            {activeMenu === '데이터셋관리' && <div style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '20px', background: '#0f766e', borderRadius: '0 3px 3px 0' }}></div>}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span className="flex-1">데이터셋 관리</span>
          </div>

          <div onClick={() => setActiveMenu('검수관리')} className={`flex items-center gap-2.5 rounded-xl mt-0.5 relative cursor-pointer transition-all ${activeMenu !== '검수관리' ? 'hover:bg-slate-50 hover:text-slate-700' : ''}`} style={activeMenu === '검수관리' ? { padding: '9px 10px', background: '#f0fdfa', color: '#0f766e', border: '1px solid rgba(15,118,110,0.15)', fontSize: '13px', fontWeight: 600 } : { padding: '9px 10px', color: '#94a3b8', border: '1px solid transparent', fontSize: '13px', fontWeight: 500 }}>
            {activeMenu === '검수관리' && <div style={{ position: 'absolute', left: '-10px', top: '50%', transform: 'translateY(-50%)', width: '3px', height: '20px', background: '#0f766e', borderRadius: '0 3px 3px 0' }}></div>}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg>
            <span className="flex-1">검수 관리</span>
          </div>

          <div style={{ height: '1px', background: '#f1f5f9', margin: '12px 4px' }}></div>
          <div style={{ fontSize: '9px', fontFamily: "'DM Mono', monospace", fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 8px', marginBottom: '6px' }}>최근 문서</div>

          {showResults ? (
            <div
              onClick={() => setActiveMenu('평가결과')}
              className="nav-item flex items-center gap-2 rounded-xl px-2 py-2 text-slate-600 text-[11px] font-bold cursor-pointer hover:bg-teal-50 hover:text-teal-700 transition-all border border-transparent hover:border-teal-100 group"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:text-teal-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedFile?.name || "문서.pdf"}</span>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#cbd5e1', padding: '8px 10px' }}>최근 문서가 없습니다.</div>
          )}
        </aside>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 overflow-y-scroll" style={{ padding: '28px 28px 400px' }}>

          {/* 1️⃣ 평가 결과 화면 */}
          {activeMenu === '평가결과' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>평가 결과</h1>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '5px', lineHeight: 1.6 }}>검색 정확도와 생성 신뢰도를 실시간 모니터링하여 RAG 파이프라인의 성능을 진단합니다.</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-2xl hover:-translate-y-[3px] transition-all hover:shadow-lg" style={{ padding: '20px 22px', border: '1px solid #e2e8f0', borderTop: '3px solid #10b981', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-4"><div className="flex items-center justify-center rounded-xl" style={{ width: '36px', height: '36px', background: '#f0fdf4' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></div><span className="font-mono text-[11px] font-semibold flex items-center gap-1 rounded-full" style={showResults ? { padding: '3px 8px', background: '#dcfce7', color: '#15803d' } : { padding: '3px 8px', background: '#f3f4f6', color: '#64748b' }}>{showResults ? "+2.4%" : "0.0%"}</span></div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', letterSpacing: '-1px', lineHeight: 1 }}>{showResults ? "0.94" : "0"}</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>답변 신뢰도</div>
                </div>
                <div className="bg-white rounded-2xl hover:-translate-y-[3px] transition-all hover:shadow-lg" style={{ padding: '20px 22px', border: '1px solid #e2e8f0', borderTop: '3px solid #3b82f6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-4"><div className="flex items-center justify-center rounded-xl" style={{ width: '36px', height: '36px', background: '#eff6ff' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></div><span className="font-mono text-[11px] font-semibold flex items-center gap-1 rounded-full" style={showResults ? { padding: '3px 8px', background: '#dbeafe', color: '#1d4ed8' } : { padding: '3px 8px', background: '#f3f4f6', color: '#64748b' }}>{showResults ? "+1.2%" : "0.0%"}</span></div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', letterSpacing: '-1px', lineHeight: 1 }}>{showResults ? "0.88" : "0"}</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>답변 적합성</div>
                </div>
                <div className="bg-white rounded-2xl hover:-translate-y-[3px] transition-all hover:shadow-lg" style={{ padding: '20px 22px', border: '1px solid #e2e8f0', borderTop: '3px solid #8b5cf6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-4"><div className="flex items-center justify-center rounded-xl" style={{ width: '36px', height: '36px', background: '#f5f3ff' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg></div><span className="font-mono text-[11px] font-semibold flex items-center gap-1 rounded-full" style={{ padding: '3px 8px', background: '#f3f4f6', color: '#64748b' }}>0.0%</span></div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', letterSpacing: '-1px', lineHeight: 1 }}>{showResults ? "0.76" : "0"}</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>문맥 정확도</div>
                </div>
                <div className="bg-white rounded-2xl hover:-translate-y-[3px] transition-all hover:shadow-lg" style={{ padding: '20px 22px', border: '1px solid #e2e8f0', borderTop: '3px solid #f43f5e', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between mb-4"><div className="flex items-center justify-center rounded-xl" style={{ width: '36px', height: '36px', background: '#fff1f2' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></div><span className="font-mono text-[11px] font-semibold flex items-center gap-1 rounded-full" style={showResults ? { padding: '3px 8px', background: '#fee2e2', color: '#dc2626' } : { padding: '3px 8px', background: '#f3f4f6', color: '#64748b' }}>{showResults ? "-5.1%" : "0.0%"}</span></div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', letterSpacing: '-1px', lineHeight: 1 }}>{showResults ? "0.42" : "0"}</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>문맥 재현율</div>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="bg-white rounded-2xl mb-6 flex flex-col items-center justify-center" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '80px 32px' }}>
                  <div className="animate-spin mb-6 flex items-center justify-center rounded-full" style={{ width: '56px', height: '56px', border: '3px solid #f1f5f9', borderTopColor: '#0d9488' }}></div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f766e', marginBottom: '8px' }}>AI가 파이프라인을 실행 중입니다...</h2>
                  <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' }}>문서를 청킹하고 벡터 데이터베이스와 대조하여<br />최적의 Q&A 세트를 생성하고 있습니다.</p>
                </div>
              ) : showResults ? (
                <div className="bg-white rounded-2xl mb-6 relative" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', animation: 'modalIn 0.3s ease-out' }}>

                  <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>RAG 평가 결과 상세</h2>

                    <div className="flex gap-2">
                      <div className="relative">
                        <button
                          onClick={() => setIsFilterOpen(!isFilterOpen)}
                          className={`flex items-center gap-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${isFilterOpen || selectedFilters.length > 0 ? 'border-teal-400 text-teal-700 bg-teal-50' : 'text-slate-500 bg-white hover:border-teal-300 hover:text-teal-700'}`}
                          style={{ padding: '6px 12px', border: (isFilterOpen || selectedFilters.length > 0) ? '1px solid #2dd4bf' : '1px solid #e2e8f0' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                          필터 {selectedFilters.length > 0 && `(${selectedFilters.length})`}
                        </button>

                        {isFilterOpen && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.1)] border border-slate-200 z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">평가 점수</span>
                              {selectedFilters.length > 0 && (
                                <button onClick={() => setSelectedFilters([])} className="text-[10px] text-teal-600 hover:text-teal-800 underline">초기화</button>
                              )}
                            </div>
                            <div className="p-1.5 flex flex-col gap-0.5">
                              <label className="flex items-center gap-2.5 px-2 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={selectedFilters.includes('excellent')} onChange={() => toggleFilter('excellent')} className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer" />
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                  <span className="text-[12px] font-medium text-slate-700">0.8 이상 (우수)</span>
                                </div>
                              </label>
                              <label className="flex items-center gap-2.5 px-2 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={selectedFilters.includes('good')} onChange={() => toggleFilter('good')} className="w-3.5 h-3.5 text-amber-500 rounded border-slate-300 focus:ring-amber-500 cursor-pointer" />
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                  <span className="text-[12px] font-medium text-slate-700">0.6 ~ 0.79 (보통)</span>
                                </div>
                              </label>
                              <label className="flex items-center gap-2.5 px-2 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" checked={selectedFilters.includes('danger')} onChange={() => toggleFilter('danger')} className="w-3.5 h-3.5 text-rose-500 rounded border-slate-300 focus:ring-rose-500 cursor-pointer" />
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                                  <span className="text-[12px] font-medium text-slate-700">0.6 미만 (위험)</span>
                                </div>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      <button onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg text-[12px] font-medium text-slate-500 bg-white hover:border-teal-300 hover:text-teal-700 transition-all cursor-pointer" style={{ padding: '6px 12px', border: '1px solid #e2e8f0' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        CSV
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-b-2xl">
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <colgroup><col style={{ width: '22%' }} /><col style={{ width: '16%' }} /><col style={{ width: '32%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /></colgroup>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          {['사용자 질문', '참조 문서', '생성 답변', '평가 점수', '상세 검수'].map((h) => (
                            <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.length > 0 ? (
                          filteredResults.map((row) => {
                            const style = getScoreStyle(row.score);
                            return (
                              <tr key={row.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.q}>{row.q}</div></td>
                                <td style={{ padding: '14px 16px', maxWidth: 0 }}><span title={uploadedFile?.name || row.doc} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 500, padding: '3px 8px', borderRadius: '7px', background: row.bg, color: row.color, maxWidth: '100%' }}><svg style={{ minWidth: '10px' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedFile?.name || row.doc}</span></span></td>
                                <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.answer}>{row.answer}</div></td>
                                <td style={{ padding: '14px 16px' }}><div className="flex items-center gap-2"><div style={{ width: '54px', height: '5px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', flexShrink: 0 }}><div style={{ width: `${row.score * 100}%`, height: '100%', background: style.bar, borderRadius: '999px' }}></div></div><span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '12px', fontWeight: 600, color: style.text }}>{row.score.toFixed(2)}</span></div></td>
                                <td style={{ padding: '14px 16px' }}>
                                  <button onClick={() => setSelectedItemForReview(row)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-[1.5px] border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-700 hover:text-white transition-all cursor-pointer whitespace-nowrap">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    리뷰 및 수정
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                              선택한 필터 조건에 맞는 결과가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl mb-6 flex flex-col items-center justify-center transition-all" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '56px 32px 52px' }}>
                  <div className="float mb-7 flex items-center justify-center rounded-3xl" style={{ width: '88px', height: '88px', background: '#f8fafc', border: '1.5px dashed #e2e8f0' }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={uploadedFile ? "#0d9488" : "#cbd5e1"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg></div>
                  <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#334155', letterSpacing: '-0.3px', marginBottom: '8px' }}>{uploadedFile ? "문서 업로드 완료!" : "아직 업로드된 문서가 없습니다"}</h2>
                  <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.8, maxWidth: '360px', marginBottom: '32px' }}>{uploadedFile ? "이제 우측 상단의 'Run Pipeline' 버튼을 눌러 평가를 시작하세요." : <>문서를 먼저 업로드하면 AI가 RAG를 기반으로<br />기출문제를 자동으로 출제하고 평가합니다.<br />아래 버튼으로 첫 번째 문서를 추가해 보세요.</>}</p>

                  <div className="dropzone w-full rounded-2xl text-center transition-all" style={{ maxWidth: '520px', border: isDragging || uploadedFile ? '2px dashed #14b8a6' : '2px dashed #e2e8f0', padding: '36px 28px', marginBottom: '28px', cursor: 'pointer', background: isDragging || uploadedFile ? '#f0fdfa' : '#fafafa' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                    <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.csv,.txt,.json,.jsonl,.md" />
                    {uploadedFile ? (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center justify-center rounded-2xl mx-auto mb-4" style={{ width: '56px', height: '56px', background: '#ccfbf1' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f766e', marginBottom: '5px' }}>{uploadedFile.name}</div>
                        <div style={{ fontSize: '12px', color: '#14b8a6' }}>{formatFileSize(uploadedFile.size)}</div>
                        <button className="mt-4 text-[12px] font-medium text-slate-400 hover:text-slate-600 underline" onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}>다른 파일 선택하기</button>
                      </div>
                    ) : (
                      <>
                        <div className="drop-icon-wrap flex items-center justify-center rounded-2xl mx-auto mb-4" style={{ width: '56px', height: '56px', background: '#f1f5f9' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg></div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>{isDragging ? "여기에 파일을 놓아주세요!" : "파일을 여기에 드래그하거나 클릭하세요"}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>최대 1GB · PDF, CSV, TXT, JSON, JSONL, MD 지원</div>
                        <div className="flex gap-2 justify-center flex-wrap mb-5">
                          {['PDF', 'CSV', 'TXT', 'JSON', 'JSONL', 'MD'].map((ext) => (
                            <span key={ext} className="font-mono text-[10px] font-medium rounded-full px-2.5 py-1" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>{ext}</span>
                          ))}
                        </div>
                        <button className="btn-upload inline-flex items-center gap-2 rounded-xl text-white text-[13px] font-semibold" style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#0f766e,#0d9488)', boxShadow: '0 4px 14px rgba(13,148,136,0.28)', border: 'none' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg> 파일 찾기</button>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4" style={{ width: '100%', maxWidth: '520px' }}>
                    <div className="step-card bg-white rounded-xl text-center" style={{ padding: '20px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}><div className="font-mono text-[9px] font-bold mb-1.5" style={{ color: '#14b8a6', letterSpacing: '0.1em' }}>STEP 01</div><div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>문서 업로드</div></div>
                    <div className="step-card bg-white rounded-xl text-center" style={{ padding: '20px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}><div className="font-mono text-[9px] font-bold mb-1.5" style={{ color: '#14b8a6', letterSpacing: '0.1em' }}>STEP 02</div><div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>AI 자동 출제</div></div>
                    <div className="step-card bg-white rounded-xl text-center" style={{ padding: '20px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}><div className="font-mono text-[9px] font-bold mb-1.5" style={{ color: '#14b8a6', letterSpacing: '0.1em' }}>STEP 03</div><div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>검수 및 승인</div></div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '20px 32px', opacity: showResults ? 1 : 0.45 }}>
                <div className="font-mono mb-5" style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Pipeline Analysis Flow</div>
                <div className="flex items-center">
                  <div className="flex flex-col items-center gap-2 flex-1"><div className="flex items-center justify-center rounded-2xl" style={{ width: '48px', height: '48px', background: showResults ? '#f0fdfa' : '#f8fafc', border: showResults ? '2px solid #99f6e4' : '2px solid #e2e8f0', color: showResults ? '#0d9488' : '#94a3b8' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg></div><div className="text-center"><div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>입력</div><div className="font-mono" style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Query Parsing</div></div></div><div style={{ flex: '0 0 40px', height: '2px', background: showResults ? '#99f6e4' : '#e2e8f0', borderRadius: '1px', marginBottom: '30px' }}></div>
                  <div className="flex flex-col items-center gap-2 flex-1"><div className="flex items-center justify-center rounded-2xl" style={{ width: '48px', height: '48px', background: showResults ? '#f0fdfa' : '#f8fafc', border: showResults ? '2px solid #99f6e4' : '2px solid #e2e8f0', color: showResults ? '#0d9488' : '#94a3b8' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></div><div className="text-center"><div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>검색</div><div className="font-mono" style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Vector Retrieval</div></div></div><div style={{ flex: '0 0 40px', height: '2px', background: showResults ? '#99f6e4' : '#e2e8f0', borderRadius: '1px', marginBottom: '30px' }}></div>
                  <div className="flex flex-col items-center gap-2 flex-1"><div className="flex items-center justify-center rounded-2xl" style={showResults ? { width: '48px', height: '48px', background: 'linear-gradient(135deg,#0f766e,#0d9488)', border: '2px solid #0d9488', boxShadow: '0 4px 16px rgba(13,148,136,0.35)', color: 'white', fontSize: '20px' } : { width: '48px', height: '48px', background: '#f8fafc', border: '2px solid #e2e8f0', color: '#94a3b8', fontSize: '20px' }}>✦</div><div className="text-center"><div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>생성</div><div className="font-mono" style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>LLM Reasoning</div></div></div><div style={{ flex: '0 0 40px', height: '2px', background: '#e2e8f0', borderRadius: '1px', marginBottom: '30px' }}></div>
                  <div className="flex flex-col items-center gap-2 flex-1"><div className="flex items-center justify-center rounded-2xl" style={{ width: '48px', height: '48px', background: '#f8fafc', border: '2px solid #e2e8f0', color: '#94a3b8' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg></div><div className="text-center"><div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>관리자 최종 검수</div><div className="font-mono" style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Admin Review</div></div></div>
                </div>
              </div>
            </div>
          )}

          {/* 2️⃣ 데이터셋 관리 화면 */}
          {activeMenu === '데이터셋관리' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>데이터셋 관리</h1>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '5px' }}>업로드된 문서들과 이를 기반으로 생성된 RAG 지식 데이터베이스를 관리합니다.</p>

              {uploadedFile ? (
                <div className="mt-8 bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>파일명</th>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>크기</th>
                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>업로드 상태</th>
                        <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 20px' }}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center rounded-lg bg-teal-50" style={{ width: '36px', height: '36px' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{uploadedFile.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b' }}>{formatFileSize(uploadedFile.size)}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 완료
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button onClick={() => setUploadedFile(null)} className="text-xs font-semibold text-rose-500 hover:text-rose-700 hover:underline">삭제</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-8 bg-white rounded-2xl flex flex-col items-center justify-center" style={{ padding: '80px 20px', border: '1px dashed #cbd5e1' }}>
                  <div className="flex items-center justify-center rounded-full bg-slate-100 mb-4" style={{ width: '64px', height: '64px' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
                  <h3 className="text-base font-semibold text-slate-700">등록된 데이터셋이 없습니다.</h3>
                  <p className="text-sm text-slate-500 mt-2">평가 결과 탭에서 문서를 먼저 추가해 보세요.</p>
                </div>
              )}
            </div>
          )}

          {/* 3️⃣ 검수 관리 화면 */}
          {activeMenu === '검수관리' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>검수 관리</h1>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '5px' }}>AI가 생성한 답변 세트를 관리자가 최종적으로 검토하고 승인하는 페이지입니다.</p>

              {showResults ? (
                <div className="mt-8 bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>검수 대기 목록</h2>
                    <span className="text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-2 py-1 rounded-md">{MOCK_RESULTS.length}건 대기중</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup><col style={{ width: '8%' }} /><col style={{ width: '35%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /><col style={{ width: '22%' }} /></colgroup>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>ID</th>
                        <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>사용자 질문</th>
                        <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>참조 문서</th>
                        <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>AI 점수</th>
                        <th style={{ padding: '11px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>승인 / 반려</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_RESULTS.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>#{row.id}</td>
                          <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.q}>{row.q}</div></td>
                          <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadedFile?.name || row.doc}</div></td>
                          <td style={{ padding: '14px 16px' }}><span style={{ color: getScoreStyle(row.score).text, fontWeight: 600, fontSize: '12px' }}>{row.score.toFixed(2)}</span></td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => alert(`ID #${row.id} 항목이 승인되었습니다!`)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors border border-emerald-200 hover:border-emerald-500 shadow-sm">승인</button>
                              <button onClick={() => alert(`ID #${row.id} 항목이 반려되었습니다.`)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors border border-rose-200 hover:border-rose-500 shadow-sm">반려</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-8 bg-white rounded-2xl flex flex-col items-center justify-center" style={{ padding: '80px 20px', border: '1px dashed #cbd5e1' }}>
                  <div className="flex items-center justify-center rounded-full bg-slate-100 mb-4" style={{ width: '64px', height: '64px' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg></div>
                  <h3 className="text-base font-semibold text-slate-700">현재 검수 대기 중인 항목이 없습니다.</h3>
                  <p className="text-sm text-slate-500 mt-2">평가 결과 탭에서 파이프라인을 먼저 실행해 주세요.</p>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* 상세 리뷰 모달창 */}
      {selectedItemForReview && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedItemForReview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-base font-bold text-slate-800">상세 리뷰 및 수정</h3>
              <button onClick={() => setSelectedItemForReview(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <div>
                <label className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-1.5 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> 사용자 질문 (Query)</label>
                <div className="p-3.5 bg-slate-50 rounded-xl text-[14px] text-slate-800 font-medium border border-slate-100 leading-relaxed">{selectedItemForReview.q}</div>
              </div>

              <div>
                <label className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-1.5 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> 참조 문서 (Context)</label>
                <div className="p-3.5 bg-slate-50 rounded-xl text-[13px] text-slate-600 font-mono border border-slate-100">{uploadedFile?.name || selectedItemForReview.doc}</div>
              </div>

              <div>
                <label className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-1.5 mb-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> 생성된 답변 (AI Answer)</label>
                <textarea className="w-full p-4 border border-slate-200 rounded-xl text-[14px] text-slate-800 leading-relaxed focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all resize-none shadow-sm" rows={4} defaultValue={selectedItemForReview.answer} />
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500">현재 시스템 평가 점수</span>
                <div className="flex items-center gap-2">
                  <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}><div style={{ width: `${selectedItemForReview.score * 100}%`, height: '100%', background: getScoreStyle(selectedItemForReview.score).bar, borderRadius: '999px' }}></div></div>
                  <span className="text-sm font-bold font-mono" style={{ color: getScoreStyle(selectedItemForReview.score).text }}>{selectedItemForReview.score.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button onClick={() => setSelectedItemForReview(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">취소</button>
              <button onClick={() => { alert('✨ 변경사항이 성공적으로 저장되었습니다!'); setSelectedItemForReview(null); }} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all shadow-sm hover:shadow-md" style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>변경사항 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}