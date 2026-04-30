export type MenuType = '테스트셋 생성' | '성능 평가';

export type QuestionItem = {
  id: number;
  text: string;
};

export type GeneratedSummary = {
  questionCount: number;
  format: 'csv' | 'xlsx';
  createdAt: string;
};

export type EvaluationSummary = {
  overallScore: number;
  questionFitScore: number;
  accuracyScore: number;
  documentAlignmentScore: number;
  evaluatedCount: number;
};

export type EvaluationRowStatus = 'good' | 'review' | 'poor';

export type EvaluationRow = {
  id: number;
  question: string;
  answer: string;
  questionFitScore: number;
  accuracyScore: number;
  documentAlignmentScore: number;
  overallScore: number;
  status: EvaluationRowStatus;
};

export type DocumentHistoryStatus = 'uploaded' | 'generated' | 'downloaded' | 'evaluated';

export type DocumentHistoryItem = {
  id: string;
  file: File;
  name: string;
  extension: string;
  size: number;
  uploadedAt: string;
  questionCount: number;
  status: DocumentHistoryStatus;
  generatedSummary: GeneratedSummary | null;
  generatedQuestions: QuestionItem[];
  hasDownloadedQuestionSet: boolean;
};

export interface EvaluationItem {
  id: number;
  q: string;
  doc: string;
  dtype: string;
  color: string;
  bg: string;
  answer: string;
  score: number;
}