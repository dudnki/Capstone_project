import React from 'react';

interface SidebarProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
  showResults: boolean;
  uploadedFile: File | null;
}

export default function Sidebar({ activeMenu, setActiveMenu, showResults, uploadedFile }: SidebarProps) {
  return (
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
  );
}