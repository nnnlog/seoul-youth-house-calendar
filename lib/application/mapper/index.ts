import {Post, RawPostType} from "../type/db/post.js";
import {LLMParser} from "./parser/llmParser.js";
import crypto from "crypto";

const llmParser = new LLMParser();

const sha256 = (text: string): string => {
    return crypto.hash("sha256", text);
};

interface TemporaryPost {
    id: number;
    contentHash: string;
}

export const convertPostToTemporaryModel = (post: RawPostType): TemporaryPost => {
    return {
        id: post.boardId,
        contentHash: sha256(post.content),
    };
};

export const convertPostToModel = async (post: RawPostType): Promise<Post> => {
    const parsedInformation = (await llmParser.parse(post.content))[0];

    return new Post({
        id: post.boardId,
        title: post.nttSj,
        memo: `모집 공고 : https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${post.boardId}&menuNo=400008`,
        contentHash: sha256(post.content),
        applicationStart: parsedInformation.application_start ?? undefined,
        applicationEnd: parsedInformation.application_end ?? undefined,
        approvedStart: parsedInformation.approved_start ?? undefined,
        approvedEnd: parsedInformation.approved_end ?? undefined,
    });
};

export const convertPostsToModel = async (posts: RawPostType[]): Promise<Post[]> => {
    const parsedInformation = await llmParser.parse(`공고 개수 : ${posts.length}\n======================\n` + posts.map(e => e.content).join("=".repeat(30)));

    // console.log(parsedInformation, posts);
    if (parsedInformation.length !== posts.length) {
        throw new Error("Parsed information length does not match posts length.");
    }

    return parsedInformation.map((e, i) => new Post({
        id: posts[i].boardId,
        title: posts[i].nttSj,
        memo: `모집 공고 : https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${posts[i].boardId}&menuNo=400008`,
        contentHash: sha256(posts[i].content),
        applicationStart: e.application_start ?? undefined,
        applicationEnd: e.application_end ?? undefined,
        approvedStart: e.approved_start ?? undefined,
        approvedEnd: e.approved_end ?? undefined,
    }));
};
