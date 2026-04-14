export type MenuType = '테스트셋 생성' | '성능 평가';

export type QuestionItem = {
  id: number;
  text: string;
};

export type GeneratedSummary = {
  questionCount: number;
  format: 'csv' | 'json';
  createdAt: string;
};

export type EvaluationSummary = {
  overallScore: number;
  retrievalScore: number;
  generationScore: number;
  groundedScore: number;
  evaluatedCount: number;
};

export type EvaluationRowStatus = 'good' | 'review' | 'poor';

export type EvaluationRow = {
  id: number;
  question: string;
  answer: string;
  retrievedContext: string[];
  retrievalScore: number;
  generationScore: number;
  groundedScore: number;
  overallScore: number;
  status: EvaluationRowStatus;
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