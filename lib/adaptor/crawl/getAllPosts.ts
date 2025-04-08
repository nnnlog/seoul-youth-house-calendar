import * as cheerio from 'cheerio';
import qs from "querystring";
import {fileTypeFromBuffer} from 'file-type';

import {RawPostType} from "../../application/type/db/post.js";

const LIST_URL = "https://soco.seoul.go.kr/youth/pgm/home/yohome/bbsListJson.json";
const API_ID = "BMSR00015";

const getAllPosts = async () => {
    const results: RawPostType[] = [];

    let maxPage = 1;
    for (let page = 1; page <= maxPage; page++) {
        let res = await (await fetch(LIST_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: qs.stringify({
                bbsId: API_ID,
                pageIndex: page,
                searchAdresGu: "",
                searchCondition: "",
                searchKeyword: ""
            }),
        })).json();

        maxPage = res.pagingInfo.totPage;

        for (const post of res.resultList as RawPostType[]) {
            let {boardId, nttSj, content, atchFileId} = post;
            content = cheerio.load(content).text();

            let attachment: Buffer | null = null;
            if (atchFileId) {
                const res = await (await fetch(`https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${boardId}&menuNo=400008`)).text();
                const $ = cheerio.load(res);
                const elements = $(".file > a[href^='/coHouse/cmmn/file/fileDown.do']").get();
                for (const element of elements) {
                    let downloadLink = $(element).attr()!["href"];
                    if (!downloadLink.startsWith("http")) {
                        downloadLink = `https://soco.seoul.go.kr${downloadLink}`;
                    }

                    attachment = Buffer.from(await (await fetch(downloadLink)).arrayBuffer());

                    const type = await fileTypeFromBuffer(attachment);
                    if (!type || type.mime !== "application/pdf") {
                        attachment = null;
                    } else {
                        break;
                    }
                }
            }

            results.push({boardId, nttSj, content, attachment, atchFileId});
        }
    }

    return results;
};

export default getAllPosts;
