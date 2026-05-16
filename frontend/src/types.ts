export type MenuType = '테스트셋 생성' | '성능 평가';
export type PipelineMode = 'model' | 'human';

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
  overallFeedback?: {
    strengths: string;
    direction: string;
  };
};

export type EvaluationRowStatus = 'good' | 'review' | 'poor';

export type QuestionFeedback = {
  reasoning: string;
  improvements: string;
  advice: string;
};

export type EvaluationRow = {
  id: number;
  question: string;
  answer: string;
  questionFitScore: number;
  accuracyScore: number;
  documentAlignmentScore: number;
  overallScore: number;
  status: EvaluationRowStatus;
  feedback?: QuestionFeedback;
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