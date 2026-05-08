import React from 'react';

interface HeaderProps {
  activeMenu: string;
  isGenerating: boolean;
  isEvaluating: boolean;
  onActionClick: () => void;
  isActionDisabled?: boolean;
  description?: string;
  currentStepLabel?: string;
  primaryStatus?: string;
  secondaryStatus?: string;
  actionLabel?: string;
  loadingLabel?: string;
}

export default function Header({
  activeMenu,
  isGenerating,
  isEvaluating,
  onActionClick,
  isActionDisabled = false,
  description,
  currentStepLabel,
  primaryStatus,
  secondaryStatus,
  actionLabel,
  loadingLabel,
}: HeaderProps) {
  const isTestsetMenu = activeMenu === '테스트셋 생성';
  const isLoading = isTestsetMenu ? isGenerating : isEvaluating;
  const isDisabled = isLoading || isActionDisabled;
  const buttonLabel = actionLabel ?? (isTestsetMenu ? '질문 생성하기' : '평가 실행하기');
  const activeLoadingLabel = loadingLabel ?? (isTestsetMenu ? '질문 생성 중...' : '평가 실행 중...');

  return (
    <header className="relative z-[60] flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-[0_1px_4px_rgba(15,23,42,0.04)] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.16)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          </svg>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-bold tracking-tight text-slate-900">RAG 평가 플랫폼</div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {activeMenu}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{description ?? activeMenu}</span>

            {currentStepLabel && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                {currentStepLabel}
              </span>
            )}

            {primaryStatus && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600">
                {primaryStatus}
              </span>
            )}

            {secondaryStatus && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600">
                {secondaryStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        disabled={isDisabled}
        onClick={onActionClick}
        className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
          isDisabled
            ? 'cursor-not-allowed bg-slate-200 text-slate-400'
            : 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] hover:bg-blue-700'
        }`}
      >
        {!isDisabled && <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-200" />}
        {isLoading ? activeLoadingLabel : buttonLabel}
      </button>
    </header>
  );
}
