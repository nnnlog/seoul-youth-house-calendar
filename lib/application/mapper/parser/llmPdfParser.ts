import {createPartFromUri, FileState, GoogleGenAI, Type} from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenAI({apiKey});

const systemPrompt = `청년안심주택 모집공고를 요약해서 다음 JSON 포맷으로 제공하는 역할입니다.


포맷:
{
 "supply": {
  "special": {
   "youth": [...],
   "marry": [...]
  },
  "general": {
   "youth": [...],
   "marry": [...],
   "all": [...]
  }
 },
 "presentation": ...,
 "homepage": ...
}


스키마 중 최상위 supply 설명
스키마 설명:
- special.youth: 특별공급 청년형
- special.marry: 특별공급 신혼부부형
- general.youth: 일반공급 청년형
- general.marry 일반공급 신혼부부형
- general.all: 일반공급 신혼부부/청년형(둘 다 지원 가능한 유형)

값:
- 각 스키마의 값은 타입명(타입을 사용할 수 없는 경우 주거전용 크기)과 공급 호수의 객체로 구성된 배열입니다. (순서는 상관 없습니다.)
  - 객체 {"type": 타입명(문자열), "supply": 공급 호수(정수)}로 구성됩니다.
  - 타입명이 PDF에서 제공되지 않은 경우에만 주거전용 크기를 사용합니다. 구체적으로, 타입명은 24A와 같이 주거전용 크기에서 소수점을 절사하고 알파벳을 붙인(붙이지 않을 수도 있음) 문자열 형태이고, 주거전용 크기는 24m^2과 같은 형태입니다. 타입명 끝에 "형" 접미사가 오는 경우, "형"을 제거한 나머지 부분을 타입명으로 합니다.
  - 예를 들어서 "24A형 (24.05m^2)"과 같은 상황에서의 타입명은 "24A"가 됩니다.
- 만약, 해당 스키마에 속하는 공급 현황이 없다면 키를 생략하지 않고, 빈 배열로 두어야 합니다.


스키마 중 최상위 presentation 설명
스키마 설명:
- presentation: 당첨자 발표 방식 (문자열; ENUM)

값:
- presentation의 값은 "HOMEPAGE", "CONTACT", "UNKNOWN" 중 하나여야 합니다. 홈페이지 공지로 등록되면 "HOMEPAGE", 당첨자 개별 연락이면 "CONTACT"여야 합니다. 당첨자 발표 방식이 직전 두 가지 방식이 아니거나 알 수 없다면 "UNKNOWN"이어야 합니다.
  - 만약, 당첨자 발표가 공지사항에도 등록되나 당첨자에 한해서 개별 연락하는 경우에는 "HOMEPAGE"로 합니다.


스키마 중 최상위 homepage 설명
스키마 설명:
- homepage: 해당 주택의 공식 홈페이지 (문자열 또는 "null")

값:
- PDF로부터 모집 공고 대상이 되는 주택의 공식 홈페이지 주소입니다. 알 수 없는 경우에는 "null"로 합니다.
- 홈페이지 주소에 한국어가 포함된 경우, 한국어를 인코딩하지 않고 그대로 출력합니다.
- "null"을 출력하는 경우를 제외하고, 출력하는 주소는 http:// 또는 https://로 시작하여야 합니다.`;

const generationConfig = {
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
            supply: {
                type: Type.OBJECT,
                properties: {
                    special: {
                        type: Type.OBJECT,
                        properties: {
                            youth: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: {
                                            type: Type.STRING
                                        },
                                        supply: {
                                            type: Type.INTEGER
                                        }
                                    },
                                    required: [
                                        "type",
                                        "supply"
                                    ]
                                }
                            },
                            marry: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: {
                                            type: Type.STRING
                                        },
                                        supply: {
                                            type: Type.INTEGER
                                        }
                                    },
                                    required: [
                                        "type",
                                        "supply"
                                    ]
                                }
                            }
                        },
                        required: [
                            "youth",
                            "marry"
                        ]
                    },
                    general: {
                        type: Type.OBJECT,
                        properties: {
                            youth: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: {
                                            type: Type.STRING
                                        },
                                        supply: {
                                            type: Type.INTEGER
                                        }
                                    },
                                    required: [
                                        "type",
                                        "supply"
                                    ]
                                }
                            },
                            marry: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: {
                                            type: Type.STRING
                                        },
                                        supply: {
                                            type: Type.INTEGER
                                        }
                                    },
                                    required: [
                                        "type",
                                        "supply"
                                    ]
                                }
                            },
                            all: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: {
                                            type: Type.STRING
                                        },
                                        supply: {
                                            type: Type.INTEGER
                                        }
                                    },
                                    required: [
                                        "type",
                                        "supply"
                                    ]
                                }
                            }
                        },
                        required: [
                            "youth",
                            "marry",
                            "all"
                        ]
                    }
                },
                required: [
                    "special",
                    "general"
                ]
            },
            presentation: {
                type: Type.STRING
            },
            homepage: {
                type: Type.STRING
            }
        },
        required: [
            "supply",
            "presentation",
            "homepage"
        ]
    },
};

export class LlmPdfParser {
    async parse(content: Buffer | null) {
        if (content === null) {
            return {
                supply: {
                    special: {
                        youth: [],
                        marry: []
                    },
                    general: {
                        youth: [],
                        marry: [],
                        all: []
                    }
                },
                presentation: "UNKNOWN",
                homepage: null,
            };
        }

        let attachment = await genAI.files.upload({
            config: {
                mimeType: "application/pdf",
            },
            file: new Blob([content]),
        });

        while (attachment.state !== FileState.ACTIVE) {
            await new Promise(r => setTimeout(r, 500));
            attachment = await genAI.files.get({
                name: attachment.name!,
            });
        }

        let response: string | undefined;

        while (true) {
            try {
                response = (await genAI.models.generateContent({
                    model: "gemini-2.0-flash",
                    config: generationConfig,
                    contents: createPartFromUri(attachment.uri!, attachment.mimeType!),
                })).text;
                break;
            } catch (e) {
                if (e instanceof Error && (e.toString().indexOf("429 Too Many Requests") > -1 || e.toString().indexOf("The model is overloaded") > -1)) {
                    await new Promise(resolve => setTimeout(resolve, 5 * 1000));
                    continue;
                }
                throw e;
            }
        }

        genAI.files.delete({
            name: attachment.name!
        }).catch(() => {});

        if (!response) {
            throw new Error("Failed to parse PDF content");
        }

        let result = JSON.parse(response) as {
            supply: {
                special: {
                    youth: { type: string, supply: number }[],
                    marry: { type: string, supply: number }[]
                },
                general: {
                    youth: { type: string, supply: number }[],
                    marry: { type: string, supply: number }[],
                    all: { type: string, supply: number }[]
                },
            },
            presentation: "HOMEPAGE" | "CONTACT" | "UNKNOWN",
            homepage: string | "null" | null,
        };
        if (result.homepage === "null") {
            result.homepage = null;
        }

        return result;
    }
}
