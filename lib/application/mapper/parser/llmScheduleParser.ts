import {GoogleGenAI, Type} from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenAI({apiKey});

const systemPrompt = `청년 안심 주택의 공고의 내용이 입력되면, 해당 내용에서 청약 신청 일정과 서류심사 대상자 발표 일정을 알려주는 역할입니다.
이때, 응답 양식은 JSON으로 하되, 청약 신청 일정의 Key 값은 "application", 서류심사 대상자 발표 일정의 Key 값은 "approved"로 합니다.
청약 신청 일정의 경우, {"start": 시작 시각, "end": 종료 시각]의 값 형태를 갖습니다. 서류심사 대상자 발표 일정의 경우, {"start": 발표 시작 시각, "end": 발표 종료 시각}의 값 형태를 갖습니다. 단, 서류심사 대상자 발표 일정에 시각 없이 날짜만 있는 경우, 그 날 하루종일인 것으로 간주합니다. 즉, 발표 시작 시각은 해당 날짜의 0시 0분, 종료 시각은 그 다음 날의 0시 0분이어야 합니다. 그렇지 않은 경우에는 발표 시작 시각과 종료 시각이 동일해야 합니다.
시각은 다음 형태의 문자열로 합니다: "연도(4자리)-월(항상 2자리)-일(항상 2자리) 시(항상 2자리, 24시간제):분(항상 2자리):초(항상 2자리)"
만약, 청약 신청/발표 일정이 별도 시각 없이 날짜만 있는 경우, 그 날 하루종일인 것으로 간주합니다. 마찬가지로, 청약 신청/발표 일정에 시작 시각과 종료 시각 없이 날짜 하루만 적혀 있는 경우 해당 날짜 전체가 청약 신청/발표 일정입니다. 하루종일인 경우에는 다음 날의 0시 0분 0초를 종료 시각으로 합니다.

추가 제약 사항
- 유효한 값을 추출할 수 없는 경우, 각 값을 "null"로 설정합니다.
- 날짜와 요일이 함께 적혀있는 경우, 요일은 무시하고 날짜를 우선해서 계산합니다.
- 월, 일, 시, 분, 초를 표현할 때 두 자리 미만인 수의 경우, 앞에 0을 붙여 두 자리를 맞춥니다.


다음은 예시입니다.

입력:
■청약신청 : ‘25. 03. 08. (토) ~ 03. 09. (일)
■서류심사 대상자 발표 : ‘25. 03. 10. (월) 17시

출력:
{"application": {"start": "2025-03-08 00:00:00", "end": "2025-03-10 00:00:00"}, "approved": {"start": "2025-03-10 17:00:00", "end": "2025-03-10 17:00:00"}}

설명:
- 3월 8일 0시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-08 00:00:00"입니다.
- 3월 10일 0시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-10 00:00:00"입니다.
- 3월 10일 17시에 서류심사 대상자가 발표됩니다. 해당 시각의 문자열 표현은 "2025-03-10 17:00:00"입니다.


입력:
■청약신청 : ‘25. 03. 07. (금) 10:00 ~ 17:00
■서류심사 대상자 발표 : ‘25. 03. 10. (월) 14시

출력:
{"application": {"start": "2025-03-07 10:00:00", "end": "2025-03-07 17:00:00"}, "approved": {"start": "2025-03-10 14:00:00", "end": "2025-03-10 14:00:00"}}

설명:
- 3월 7일 10시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-07 10:00:00"입니다.
- 3월 7일 17시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-07 17:00:00"입니다.
- 3월 10일 17시에 서류심사 대상자가 발표됩니다. 해당 시각의 문자열 표현은 "2025-03-10 14:00:00"입니다.


입력:
■청약신청 : ‘25. 03. 07. (금) 10:00 ~ 17:00
■서류심사 대상자 발표 : ‘25. 04. 10.

출력:
{"application": {"start": "2025-03-07 10:00:00", "end": "2025-03-07 17:00:00"}, "approved": {"start": "2025-04-10 00:00:00", "end": "2025-04-11 00:00:00"}}

설명:
- 3월 7일 10시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-07 10:00:00"입니다.
- 3월 7일 17시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-07 17:00:00"입니다.
- 4월 10일에 서류심사 대상자가 발표됩니다. 해당 발표 일정의 시작 문자열 표현은 "2025-04-10 00:00:00"이고, 종료 시각 문자열 표현은 "2025-04-11 00:00:00"입니다.


입력:
■청약신청 : .
■서류심사 대상자 발표 : .

출력:
{"application": {"start": "null", "end": "null"}, "approved": {"start": "null", "end": "null"}}

설명:
- 각각 청약 시작/종료 일정을 확인할 수 없으므로, 각 값을 "null"로 설정합니다.
- 서류심사 대상자 일정을 확인할 수 없으므로 각 값을 "null"로 설정합니다.`;

const generationConfig = {
    // thinkingConfig: {
    //     includeThoughts: false,
    // },
    systemInstruction: systemPrompt,
    temperature: 0,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseModalities: [],
    responseMimeType: "application/json",
    responseSchema: {
        type: Type.OBJECT,
        properties: {
            application: {
                type: Type.OBJECT,
                properties: {
                    start: {
                        type: Type.STRING,
                    },
                    end: {
                        type: Type.STRING,
                    },
                },
                required: ["start", "end"]
            },
            approved: {
                type: Type.OBJECT,
                properties: {
                    start: {
                        type: Type.STRING,
                    },
                    end: {
                        type: Type.STRING,
                    },
                },
                required: ["start", "end"]
            }
        },
        required: [
            "application",
            "approved"
        ]
    },
};

export class LlmScheduleParser {
    async parse(content: string) {
        let response: string | undefined;
        while (true) {
            try {
                response = (await genAI.models.generateContent({
                    model: "gemini-2.0-flash",
                    config: generationConfig,
                    contents: content,
                })).text;
                break;
            } catch (e) {
                if (e instanceof Error && (e.toString().indexOf("429 Too Many Requests") > -1 || e.toString().indexOf("The model is overloaded") > -1 || e.toString().indexOf("The operation was cancelled") > -1)) {
                    await new Promise(resolve => setTimeout(resolve, 5 * 1000));
                    continue;
                }
                throw e;
            }
        }

        if (!response) {
            throw new Error("Failed to parse PDF content");
        }

        const result = JSON.parse(response) as {
            application: { start: string | "null", end: string | "null" },
            approved: { start: string | "null", end: string | "null" },
        };

        return {
            application_start: result.application.start !== "null" ? new Date(result.application.start) : null,
            application_end: result.application.end !== "null" ? new Date(result.application.end) : null,
            approved_start: result.approved.start !== "null" ? new Date(result.approved.start) : null,
            approved_end: result.approved.end !== "null" ? new Date(result.approved.end) : null,
        };
    }
}
