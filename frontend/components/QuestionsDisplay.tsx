'use client';

import { FC } from 'react';

interface Question {
  id: number;
  text: string;
}

interface QuestionsDisplayProps {
  questions: Question[];
}

const QuestionsDisplay: FC<QuestionsDisplayProps> = ({ questions }) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">📋 생성된 질문 목록</h3>
      
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {questions.map((question, index) => (
          <div
            key={question.id}
            className="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition duration-200"
          >
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  {index + 1}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-gray-800 leading-relaxed">{question.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>📊 총 {questions.length}개의 질문이 생성되었습니다</strong>
        </p>
      </div>
    </div>
  );
};

export default QuestionsDisplay;
