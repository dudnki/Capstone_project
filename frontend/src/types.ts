export type EvalMode = 'user' | 'model';
export type GenerationLevel = 'low' | 'medium' | 'high';

export type MenuType = '테스트셋 생성' | '성능 평가';

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
  evaluatedCount: number;
  overallAvgScore: number;
  faithfulness: number;
  answerRelevancy: number;
  answerCorrectness: number;
  overallFeedback?: {
    strengths: string;
    direction: string;
  };
};

export type EvaluationRowStatus = 'good' | 'review' | 'poor';

export type EvaluationRow = {
  id: string;
  question: string;
  answer: string;
  scores: {
    faithfulness: number;
    answer_relevancy: number;
    answer_correctness: number;
  };
  avg_score: number;
  status?: EvaluationRowStatus;
  feedback?: {
    reasoning: string;
    improvements: string;
    advice: string;
  };
  score_reasons?: {
    faithfulness?: string;
    answer_relevancy?: string;
    answer_correctness?: string;
  };
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
