import {Post, RawPostType} from "../type/db/post.js";
import {LlmScheduleParser} from "./parser/llmScheduleParser.js";
import crypto from "crypto";
import {LlmPdfParser} from "./parser/llmPdfParser.js";

const llmScheduleParser = new LlmScheduleParser();
const llmPdfParser = new LlmPdfParser();

const sha256 = (text: string | Buffer): string => {
    return crypto.hash("sha256", text);
};

interface TemporaryPost {
    id: number;
    contentHash: string;
    attachmentHash: string | null;
}

export const convertPostToTemporaryModel = (post: RawPostType): TemporaryPost => {
    return {
        id: post.boardId,
        contentHash: sha256(post.content),
        attachmentHash: post.attachment ? sha256(post.attachment) : null,
    };
};

export const convertPostToModel = async (post: RawPostType): Promise<Post> => {
    const parsedScheduleInformation = await llmScheduleParser.parse(post.content);
    const parsedPdfInformation = await llmPdfParser.parse(post.attachment);

    let information: string[] = [];
    {
        const url = `https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${post.boardId}&menuNo=400008`;
        const homepage = parsedPdfInformation.homepage;

        information.push(`모집 공고 : <a href="${encodeURI(url)}">${url}</a>`);
        if (homepage) {
            information.push(`홈페이지 : <a href="${encodeURI(homepage)}">${homepage}</a>`);
        }
        if (parsedPdfInformation.presentation !== "UNKNOWN") {
            information.push(`발표 방식 : ${parsedPdfInformation.presentation === "CONTACT" ? "당첨자 개별 연락" : "홈페이지 공지"}`);
        }

        information = information.map(s => `<li>${s}</li>`);
    }

    let supply: string[] = [];
    {
        const add = (provide_type: string, provide_target: string, type: string, count: number) => {
            if (count > 0) {
                supply.push(`[${provide_type} ${provide_target}] ${type}형 ${count}세대`);
            }
        };

        for (const {type, supply} of parsedPdfInformation.supply.special.youth) {
            add("특별공급", "청년형", type, supply);
        }
        for (const {type, supply} of parsedPdfInformation.supply.special.marry) {
            add("특별공급", "신혼부부형", type, supply);
        }
        for (const {type, supply} of parsedPdfInformation.supply.general.youth) {
            add("일반공급", "청년형", type, supply);
        }
        for (const {type, supply} of parsedPdfInformation.supply.general.marry) {
            add("일반공급", "신혼부부형", type, supply);
        }
        for (const {type, supply} of parsedPdfInformation.supply.general.all) {
            add("일반공급", "청년/신혼부부형", type, supply);
        }

        supply = supply.map(s => `<li>${s}</li>`);
    }

    return new Post({
        id: post.boardId,
        title: post.nttSj,
        memo: `모집 공고 정보<ul>${information.join("")}</ul>
공급 현황<ul>${supply.length > 0 ? supply.join("") : "<li>알려지지 않음.</li>"}</ul>

면책 사항<ul><li>이 정보는 Google의 Gemini를 이용하여 자동으로 처리되었습니다.</li><li>제공되는 정보는 정확하지 않을 수 있습니다.</li></ul>`,
        contentHash: sha256(post.content),
        attachmentHash: post.attachment ? sha256(post.attachment) : undefined,
        applicationStart: parsedScheduleInformation.application_start ?? undefined,
        applicationEnd: parsedScheduleInformation.application_end ?? undefined,
        approvedStart: parsedScheduleInformation.approved_start ?? undefined,
        approvedEnd: parsedScheduleInformation.approved_end ?? undefined,
    });
};
