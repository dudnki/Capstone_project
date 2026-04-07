import React from 'react';

interface HeaderProps {
  showResults: boolean;
  isAnalyzing: boolean;
  uploadedFile: File | null;
  handleReset: () => void;
  handleRunPipeline: () => void;
}

export default function Header({ showResults, isAnalyzing, uploadedFile, handleReset, handleRunPipeline }: HeaderProps) {
  return (
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
  );
}