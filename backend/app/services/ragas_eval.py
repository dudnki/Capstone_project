# ragas_eval.py (핵심 부분만 수정)

def evaluate_user_document(document_text, model_answer):
    """
    실제 사용자의 문서 내용과 모델의 답변을 받아 평가를 수행하는 함수
    """
    try:
        print("💡 [Step 1] 문서 기반 질문 생성 중...")
        # 1. 문서에서 질문과 모범답안 생성
        gold_data = generate_gold_standard(document_text)
        
        question = gold_data.get("question")
        gt = gold_data.get("ground_truth")

        print(f"❓ 생성된 질문: {question}")
        print(f"✅ 모범 답안: {gt}")

        print("🤖 [Step 2] Ragas 평가 진행...")
        # 2. 사용자가 입력한 답변(model_answer)과 비교 평가
        dataset = Dataset.from_dict({
            "question": [question],
            "answer": [model_answer],
            "contexts": [[document_text]],
            "ground_truth": [gt]
        })
        
        result = evaluate(dataset=dataset, metrics=metrics)
        res_dict = result.to_pandas().iloc[0].to_dict()

        # 3. 데이터 정리
        final_report = {
            "question": question,
            "ground_truth": gt,
            "user_answer": model_answer,
            "context": document_text[:200] + "...", # DB 저장용 요약
            "faithfulness_score": clean_score(res_dict.get("faithfulness")),
            "answer_relevance_score": clean_score(res_dict.get("answer_relevancy")),
            "context_precision_score": clean_score(res_dict.get("answer_correctness")),
        }
        
        return final_report

    except Exception as e:
        print(f"평가 중 에러 발생: {e}")
        return None

# 테스트용 실행부
if __name__ == "__main__":
    # 실제 사용자가 올린 문서라고 가정 (긴 텍스트)
    user_uploaded_doc = """
    인공지능(AI)은 인간의 학습능력, 추론능력, 지각능력을 인공적으로 구현한 기술이다. 
    최근 LLM(대규모 언어 모델)의 발전으로 자연어 처리 능력이 비약적으로 상승했다.
    """
    
    # 사용자의 시스템이 내놓은 답변이라고 가정
    user_system_answer = "AI는 인간의 능력을 흉내 내는 기술이며 최근 언어 모델이 발전했습니다."
    
    report = evaluate_user_document(user_uploaded_doc, user_system_answer)
    
    if report:
        print("\n🎯 최종 평가 리포트:")
        print(report)
        # 여기서 supabase.table(...).insert(report).execute() 호출