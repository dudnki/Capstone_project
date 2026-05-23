import React from 'react';

interface SidebarProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
}

const MENUS = ['테스트셋 생성', '성능 평가'] as const;

export default function Sidebar({ activeMenu, setActiveMenu }: SidebarProps) {
  return (
    <aside className="z-[40] hidden w-[168px] flex-shrink-0 border-r border-slate-200 bg-white px-2 py-4 xl:flex xl:flex-col">
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
              className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
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

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{menu}</p>
                <p className="mt-1 whitespace-normal break-keep text-[11px] leading-4 text-slate-400">
                  {menu === '테스트셋 생성' ? '업로드 · 생성 · 검토' : '제출 · 실행 · 결과'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
