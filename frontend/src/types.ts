export type MenuType = '테스트셋 생성' | '성능 평가';

export type EvaluationMode = 'chatbot' | 'resultFile';

export type QuestionItem = {
  id: string;
  text: string;
};

export type GeneratedSummary = {
  questionCount: number;
  format: 'csv';
  createdAt: string;
};

export type EvaluationSummary = {
  overallScore: number;
  answerRelevancyScore: number;
  answerAccuracyScore: number;
  answerSimilarityScore: number;
  evaluatedCount: number;
};

export type EvaluationRowStatus = 'good' | 'review' | 'poor';

export type EvaluationRow = {
  id: string;
  question: string;
  answer: string;
  answerRelevancyScore: number;
  answerAccuracyScore: number;
  answerSimilarityScore: number;
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
  resultFile: File | null;
  evaluationSummary: EvaluationSummary | null;
  evaluationRows: EvaluationRow[];
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
