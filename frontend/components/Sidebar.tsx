import React from 'react';
import type { DocumentHistoryItem, DocumentHistoryStatus } from '../src/types';

interface SidebarProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
  documentHistories: DocumentHistoryItem[];
  activeDocumentId: string | null;
  onSelectDocumentHistory: (id: string) => void;
}

const MENUS = ['테스트셋 생성', '성능 평가'] as const;

const getStatusLabel = (status: DocumentHistoryStatus) => {
  if (status === 'uploaded') return '업로드';
  if (status === 'generated') return '질문 생성';
  if (status === 'downloaded') return '다운로드';
  return '평가 완료';
};

const getStatusStyle = (status: DocumentHistoryStatus) => {
  if (status === 'uploaded') return 'border-slate-200 bg-slate-50 text-slate-500';
  if (status === 'generated') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (status === 'downloaded') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Sidebar({
  activeMenu,
  setActiveMenu,
  documentHistories,
  activeDocumentId,
  onSelectDocumentHistory,
}: SidebarProps) {
  return (
    <aside className="z-[40] hidden w-[272px] flex-shrink-0 border-r border-slate-200 bg-white px-3 py-4 xl:flex xl:flex-col">
      <div className="px-2 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workflow</p>
      </div>

      <div className="space-y-1">
        {MENUS.map((menu) => {
          const isActive = activeMenu === menu;

          return (
            <button
              key={menu}
              type="button"
              onClick={() => setActiveMenu(menu)}
              className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isActive ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {menu === '테스트셋 생성' ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                )}
              </span>

              <div className="min-w-0">
                <p className="text-sm font-semibold">{menu}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                  {menu === '테스트셋 생성' ? '업로드 · 생성 · 다운로드' : '제출 · 실행 · 결과'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Recent Docs</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {documentHistories.length}
          </span>
        </div>

        {documentHistories.length === 0 ? (
          <div className="mx-1 mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <p className="text-sm font-semibold text-slate-600">최근 문서 없음</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              기준 문서를 업로드하면 이곳에 기록이 남습니다.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {documentHistories.map((item) => {
              const isActive = activeDocumentId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectDocumentHistory(item.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    isActive
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${isActive ? 'text-blue-800' : 'text-slate-700'}`}>
                        {item.name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {item.uploadedAt} · {formatFileSize(item.size)}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                      {item.extension}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusStyle(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      질문 {item.questionCount}개
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}