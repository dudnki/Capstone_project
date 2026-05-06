// 디버깅을 위한 로거 함수
const log = {
  info: (message: string, data?: any) => {
    console.log(`[API INFO] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[API ERROR] ${message}`, error || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[API WARN] ${message}`, data || '');
  },
  request: (method: string, url: string, body?: any) => {
    console.log(`[API REQUEST] ${method} ${url}`, body || '');
  },
  response: (method: string, url: string, status: number, data?: any) => {
    console.log(`[API RESPONSE] ${method} ${url} - Status: ${status}`, data || '');
  },
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

console.log('[API INIT] BASE_URL:', BASE_URL);

// 1단계: 파일을 백엔드에 업로드
export async function uploadDocument(file: File) {
  try {
    log.info('uploadDocument 시작');
    log.info('BASE_URL:', BASE_URL);
    log.info('파일:', { name: file.name, size: file.size, type: file.type });

    const formData = new FormData();
    formData.append('file', file);

    const uploadUrl = `${BASE_URL}/api/upload`;
    log.request('POST', uploadUrl);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    log.response('POST', uploadUrl, res.status);

    if (!res.ok) {
      const errorText = await res.text();
      log.error(`HTTP ${res.status}:`, errorText);
      throw new Error(`파일 업로드 실패 (${res.status}): ${errorText}`);
    }

    const responseData = await res.json();
    log.info('uploadDocument 성공:', responseData);
    return responseData;

  } catch (error) {
    log.error('uploadDocument 오류:', error);
    throw error;
  }
}

// 2단계: 업로드된 파일로 파이프라인 실행 (질문 생성)
export async function runPipeline(savedFilename: string, originalFilename: string) {
  try {
    log.info('runPipeline 시작');
    log.info('파라미터:', { savedFilename, originalFilename });

    const formData = new FormData();
    formData.append('saved_filename', savedFilename);
    formData.append('original_filename', originalFilename);

    log.info('FormData 필드:');
    for (const [key, value] of formData.entries()) {
      log.info(`  - ${key}:`, value);
    }

    const url = `${BASE_URL}/api/pipeline/run`;
    log.request('POST', url);

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    log.response('POST', url, res.status);

    if (!res.ok) {
      const errorText = await res.text();
      log.error(`HTTP ${res.status}:`, errorText);
      throw new Error(`Pipeline failed: ${res.status} - ${errorText}`);
    }

    const responseData = await res.json();
    log.info('runPipeline 성공:', responseData);
    return responseData;

  } catch (error) {
    log.error('runPipeline 오류:', error);
    throw error;
  }
}

// ⭐ 3단계: 사용자 답변 제출 및 평가 (새로 추가)
export const submitUserAnswers = async (
  questionIds: string[],
  userAnswers: Record<string, string>
) => {
  console.log('========== submitUserAnswers 시작 ==========');
  console.log('[API DEBUG] 함수 호출됨');
  console.log('[API DEBUG] questionIds:', questionIds);
  console.log('[API DEBUG] userAnswers:', userAnswers);

  // 1. 파라미터 검증
  console.log('[VALIDATION] questionIds 타입:', typeof questionIds);
  console.log('[VALIDATION] questionIds 배열인가?', Array.isArray(questionIds));
  console.log('[VALIDATION] questionIds 길이:', questionIds?.length);
  
  console.log('[VALIDATION] userAnswers 타입:', typeof userAnswers);
  console.log('[VALIDATION] userAnswers 값:', Object.keys(userAnswers || {}));
  console.log('[VALIDATION] userAnswers 길이:', Object.keys(userAnswers || {}).length);

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    console.error('[ERROR] questionIds가 유효하지 않습니다:', questionIds);
    throw new Error('질문 ID 배열이 필요합니다');
  }

  if (!userAnswers || typeof userAnswers !== 'object') {
    console.error('[ERROR] userAnswers가 유효하지 않습니다:', userAnswers);
    throw new Error('사용자 답변 객체가 필요합니다');
  }

  // 2. 페이로드 구성
  console.log('[PAYLOAD] 페이로드 구성 시작');
  const payload = {
    question_ids: questionIds,
    user_answers: userAnswers,
  };
  console.log('[PAYLOAD] 최종 페이로드:', JSON.stringify(payload, null, 2));

  // 3. API 요청
  try {
    console.log('[API REQUEST] POST /api/submit 요청 시작');
    console.log('[API REQUEST] BASE_URL:', BASE_URL);
    console.log('[API REQUEST] 전체 URL:', `${BASE_URL}/api/submit`);
    console.log('[API REQUEST] 요청 body:', payload);

    const response = await fetch(`${BASE_URL}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[API RESPONSE] 상태 코드:', response.status);
    console.log('[API RESPONSE] 상태 텍스트:', response.statusText);
    console.log('[API RESPONSE] Content-Type:', response.headers.get('content-type'));

    // 4. 응답 파싱
    const data = await response.json();
    console.log('[API RESPONSE] 응답 데이터:', data);

    if (!response.ok) {
      console.error('[ERROR] API 응답 실패:', {
        status: response.status,
        data: data,
      });
      throw new Error(`API 오류: ${response.status} - ${data?.message || '알 수 없는 오류'}`);
    }

    console.log('[SUCCESS] submitUserAnswers 성공');
    console.log('========== submitUserAnswers 완료 ==========');
    return data;
  } catch (error) {
    console.error('[EXCEPTION] submitUserAnswers에서 예외 발생:', error);
    console.error('[EXCEPTION] 에러 메시지:', error instanceof Error ? error.message : String(error));
    console.error('[EXCEPTION] 에러 스택:', error instanceof Error ? error.stack : '스택 없음');
    throw error;
  }
};
