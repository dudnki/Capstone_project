import React from 'react';

interface DatasetManagerProps {
  uploadedFile: File | null;
  setUploadedFile: (file: File | null) => void;
  formatFileSize: (bytes: number) => string;
}

export default function DatasetManager({ uploadedFile, setUploadedFile, formatFileSize }: DatasetManagerProps) {
  return (
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
  );
}