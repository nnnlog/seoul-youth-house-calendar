import {DataSource, DataSourceOptions} from "typeorm"
import {Post} from "../../application/type/db/post.js";
import {Setting} from "../../application/type/db/setting.js";
import {Event} from "../../application/type/db/event.js";

const options: DataSourceOptions = {
    type: "sqlite",
    database: "./db.sqlite",
    synchronize: true,
    entities: [
        Post,
        Setting,
        Event,
    ],
};

let dataSource = new DataSource(options);

const postRepository = dataSource.getRepository(Post);
const settingRepository = dataSource.getRepository(Setting);
const eventRepository = dataSource.getRepository(Event);

export default {
    init: async (): Promise<void> => {
        await dataSource.initialize();

    },
    dataSource: dataSource,
    postRepository: postRepository,
    settingRepository: settingRepository,
    eventRepository: eventRepository,
};
