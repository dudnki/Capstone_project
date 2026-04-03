import React from 'react';

interface ReviewManagerProps {
  showResults: boolean;
  MOCK_RESULTS: any[];
  uploadedFile: File | null;
  selectedItemForReview: any | null;
  setSelectedItemForReview: (item: any | null) => void;
}

export default function ReviewManager({ showResults, MOCK_RESULTS, uploadedFile, selectedItemForReview, setSelectedItemForReview }: ReviewManagerProps) {

  const getScoreStyle = (score: number) => {
    if (score >= 0.8) return { bar: "#34d399", text: "#059669" };
    if (score >= 0.6) return { bar: "#fbbf24", text: "#d97706" };
    return { bar: "#f87171", text: "#e11d48" };
  };

  return (
    <>
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
    </>
  );
}