import * as cheerio from 'cheerio';
import qs from "querystring";
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
            let {boardId, nttSj, content} = post;
            content = cheerio.load(content).text();
            results.push({boardId, nttSj, content});
        }
    }

    return results;
};

export default getAllPosts;
