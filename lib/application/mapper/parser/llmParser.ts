import ModelClient, {isUnexpected} from "@azure-rest/ai-inference";
import {AzureKeyCredential} from "@azure/core-auth";

const systemPrompt = `청년안심주택의 공고가 여러 개 주어질 때, 해당 공고 내용을 각각 파싱하여 정보를 알려주는 역할입니다. 공고 내용을 파싱하는 구체적인 방법은 아래 별도 섹션에 있습니다.
각 공고 입력은 "=" 문자가 여러 번 반복되는 문자열로 구분됩니다. 각 공고를 파싱한 결과를 배열에 "차례대로" 넣어서 반환합니다. 즉, 출력하는 배열의 길이는 입력(공고)의 개수와 반드시 같아야 하고, 누락된 것이 있으면 안 됩니다. 반환 값은 최상위에 result key를 두고, 그 아래에 각 공고를 파싱한 결과를 넣어야 합니다. 각 공고는 독립적으로 처리되어야 합니다. 예를 들어, 3개의 입력이 주어진 경우, 다음과 같은 형태로 반환해야 합니다.
형식) {"result": [{...}, {...}, {...}]}
예시 1 - 3개) {"result": [{"application": ["2025-03-07 10:00:00", "2025-03-07 17:00:00"], "approved": ["2025-03-10 14:00:00", "2025-03-10 14:00:00"]}, {"application": ["2025-03-07 10:00:00", "2025-03-07 17:00:00"], "approved": ["2025-04-10 00:00:00", "2025-04-11 00:00:00"]}]}
예시 2 - 1개) {"result": [{"application": ["2025-03-07 10:00:00", "2025-03-07 17:00:00"], "approved": ["2025-03-10 14:00:00", "2025-03-10 14:00:00"]}]}

공고 처리 방법:
청년 안심 주택의 공고의 내용이 입력되면, 해당 내용에서 청약 신청 일정과 서류심사 대상자 발표 일정을 알려주는 역할입니다.
이때, 응답 양식은 JSON으로 하되, 청약 신청 일정의 Key 값은 "application", 서류심사 대상자 발표 일정의 Key 값은 "approved"로 합니다.
청약 신청 일정의 경우, [시작 시각, 종료 시각]의 값 형태를 갖습니다. 서류심사 대상자 발표 일정의 경우, [발표 시작 시각, 발표 종료 시각]의 값 형태를 갖습니다. 단, 서류심사 대상자 발표 일정에 시각 없이 날짜만 있는 경우, 그 날 하루종일인 것으로 간주합니다. 즉, 발표 시작 시각은 해당 날짜의 0시 0분, 종료 시각은 그 다음 날의 0시 0분이어야 합니다. 그렇지 않은 경우에는 발표 시작 시각과 종료 시각이 동일해야 합니다.
시각은 다음 형태의 문자열로 합니다: "연도(4자리)-월(항상 2자리)-일(항상 2자리) 시(항상 2자리, 24시간제):분(항상 2자리):초(항상 2자리)"
만약, 청약 신청/발표 일정이 별도 시각 없이 날짜만 있는 경우, 그 날 하루종일인 것으로 간주합니다. 마찬가지로, 청약 신청/발표 일정에 시작 시각과 종료 시각 없이 날짜 하루만 적혀 있는 경우 해당 날짜 전체가 청약 신청/발표 일정입니다. 하루종일인 경우에는 다음 날의 0시 0분 0초를 종료 시각으로 합니다.

추가 제약 사항
- 유효한 값을 추출할 수 없는 경우, 각 값을 null로 설정합니다.
- 날짜와 요일이 함께 적혀있는 경우, 요일은 무시하고 날짜를 우선해서 계산합니다.
- 월, 일, 시, 분, 초를 표현할 때 두 자리 미만인 수의 경우, 앞에 0을 붙여 두 자리를 맞춥니다.


다음은 예시입니다.

입력:
■청약신청 : ‘25. 03. 08. (토) ~ 03. 09. (일)
■서류심사 대상자 발표 : ‘25. 03. 10. (월) 17시

출력:
{"application": ["2025-03-08 00:00:00", "2025-03-10 00:00:00"], "approved": ["2025-03-10 17:00:00", "2025-03-10 17:00:00"]}

설명:
- 3월 8일 0시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-08 00:00:00"입니다.
- 3월 10일 0시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-10 00:00:00"입니다.
- 3월 10일 17시에 서류심사 대상자가 발표됩니다. 해당 시각의 문자열 표현은 "2025-03-10 17:00:00"입니다.


입력:
■청약신청 : ‘25. 03. 07. (금) 10:00 ~ 17:00
■서류심사 대상자 발표 : ‘25. 03. 10. (월) 14시

출력:
{"application": ["2025-03-07 10:00:00", "2025-03-07 17:00:00"], "approved": ["2025-03-10 14:00:00", "2025-03-10 14:00:00"]}

설명:
- 3월 7일 10시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-07 10:00:00"입니다.
- 3월 7일 17시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-07 17:00:00"입니다.
- 3월 10일 17시에 서류심사 대상자가 발표됩니다. 해당 시각의 문자열 표현은 "2025-03-10 14:00:00"입니다.


입력:
■청약신청 : ‘25. 03. 07. (금) 10:00 ~ 17:00
■서류심사 대상자 발표 : ‘25. 04. 10.

출력:
{"application": ["2025-03-07 10:00:00", "2025-03-07 17:00:00"], "approved": ["2025-04-10 00:00:00", "2025-04-11 00:00:00"]}

설명:
- 3월 7일 10시 정각에 청약 신청이 시작합니다. 해당 시각의 문자열 표현은 "2025-03-07 10:00:00"입니다.
- 3월 7일 17시 정각에 청약 신청이 종료됩니다. 해당 시각의 문자열 표현은 "2025-03-07 17:00:00"입니다.
- 4월 10일에 서류심사 대상자가 발표됩니다. 해당 발표 일정의 시작 문자열 표현은 "2025-04-10 00:00:00"이고, 종료 시각 문자열 표현은 "2025-04-11 00:00:00"입니다.


입력:
■청약신청 : .
■서류심사 대상자 발표 : .

출력:
{"application": [null, null], "approved": [null, null]}

설명:
- 각각 청약 시작/종료 일정을 확인할 수 없으므로, 각 값을 null로 설정합니다.
- 서류심사 대상자 일정을 확인할 수 없으므로 각 값을 null로 설정합니다.`;

const token = process.env["GITHUB_TOKEN"]!;
const endpoint = "https://models.inference.ai.azure.com";
const modelName = "gpt-4o";

const client = ModelClient(endpoint, new AzureKeyCredential(token));

export class LLMParser {
    async parse(content: string) {
        do {
            const response = await client.path("/chat/completions").post({
                body: {
                    messages: [
                        {role: "system", content: systemPrompt},
                        {role: "user", content: content}
                    ],
                    temperature: 0.0,
                    top_p: 1.0,
                    max_tokens: 8000,
                    model: modelName,
                    response_format: {"type": "json_object"}
                },
            });

            if (isUnexpected(response)) {
                console.error(response);

                if (response.status === "429") continue;

                throw Error("Failed to get response from the model.");
            }

            if (response.body.choices[0].message.content === null) {
                throw Error("Failed to get response from the model.");
            }

            // console.log(content);
            // console.log(response.body.choices[0].message.content);
            const result = (JSON.parse(response.body.choices[0].message.content) as {
                result: {
                    application: [string | null, string | null],
                    approved
                        :
                        [string | null, string | null],
                }[]
            }).result;

            return result.map(e => ({
                application_start: e.application[0] ? new Date(e.application[0]) : null,
                application_end: e.application[1] ? new Date(e.application[1]) : null,
                approved_start: e.approved[0] ? new Date(e.approved[0]) : null,
                approved_end: e.approved[1] ? new Date(e.approved[1]) : null,
            }));
        } while (true);
    }
}
