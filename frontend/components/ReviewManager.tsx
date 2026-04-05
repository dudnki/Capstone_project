import React from 'react';
import { EvaluationItem } from '../src/types';

interface ReviewManagerProps {
  showResults: boolean;
  reviewItems: EvaluationItem[];
  uploadedFile: File | null;
  handleApprove: (id: number) => void;
  handleReject: (id: number) => void;
}

export default function ReviewManager({ 
  showResults, reviewItems, uploadedFile, handleApprove, handleReject 
}: ReviewManagerProps) {

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

        {showResults && reviewItems.length > 0 ? (
          <div className="mt-8 bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>검수 대기 목록</h2>
              <span className="text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-2 py-1 rounded-md">{reviewItems.length}건 대기중</span>
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
                {reviewItems.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>#{row.id}</td>
                    <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.q}>{row.q}</div></td>
                    <td style={{ padding: '14px 16px', maxWidth: 0 }}><div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadedFile?.name || row.doc}</div></td>
                    <td style={{ padding: '14px 16px' }}><span style={{ color: getScoreStyle(row.score).text, fontWeight: 600, fontSize: '12px' }}>{row.score.toFixed(2)}</span></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleApprove(row.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors border border-emerald-200 hover:border-emerald-500 shadow-sm">승인</button>
                        <button onClick={() => handleReject(row.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors border border-rose-200 hover:border-rose-500 shadow-sm">반려</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : showResults && reviewItems.length === 0 ? (
          <div className="mt-8 bg-white rounded-2xl flex flex-col items-center justify-center" style={{ padding: '80px 20px', border: '1px dashed #cbd5e1' }}>
            <div className="flex items-center justify-center rounded-full bg-teal-50 mb-4" style={{ width: '64px', height: '64px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-700">모든 항목의 검수가 완료되었습니다! 🎉</h3>
            <p className="text-sm text-slate-500 mt-2">수고하셨습니다. 새로운 문서를 추가해 파이프라인을 실행해 보세요.</p>
          </div>
        ) : (
          <div className="mt-8 bg-white rounded-2xl flex flex-col items-center justify-center" style={{ padding: '80px 20px', border: '1px dashed #cbd5e1' }}>
            <div className="flex items-center justify-center rounded-full bg-slate-100 mb-4" style={{ width: '64px', height: '64px' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></svg></div>
            <h3 className="text-base font-semibold text-slate-700">현재 검수 대기 중인 항목이 없습니다.</h3>
            <p className="text-sm text-slate-500 mt-2">평가 결과 탭에서 파이프라인을 먼저 실행해 주세요.</p>
          </div>
        )}
      </div>
    </>
  );
}