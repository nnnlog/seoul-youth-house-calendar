import "./lib/application/config"

import cron from "node-cron";
import * as process from "node:process";
import ProgressBar from "progress";

import db from "./lib/adaptor/db/index.js";
import * as mapper from "./lib/application/mapper/index.js";
import {
    addEvent,
    createCalendar,
    getAllEvents,
    getCalendarList, removeEvent,
    updateCalendarSettings, updateEvent
} from "./lib/adaptor/calendar/index.js";
import getAllPosts from "./lib/adaptor/crawl/getAllPosts.js";
import {Event} from "./lib/application/type/db/event.js";
import {Setting} from "./lib/application/type/db/setting.js";
import {Post, RawPostType} from "./lib/application/type/db/post.js";

const _addApplicationEvent = async (calendarId: string, post: Post, eventId?: string) => {
    if (!post.applicationStart || !post.applicationEnd) return null;

    let event = new Event({
        id: "",
        start: new Date(post.applicationStart),
        end: new Date(post.applicationEnd),
        title: `[신청] - ${post.title}`,
        memo: post.memo,
    });

    let id: string | null;
    if (eventId === undefined) id = await addEvent(calendarId, event);
    else {
        event.id = eventId;
        id = await updateEvent(calendarId, event);
    }

    if (id !== null) {
        event.id = id;
        post.applicationCalendarId = id;

        return event;
    }

    return null;
};

const _addApprovedEvent = async (calendarId: string, post: Post, eventId?: string) => {
    if (!post.approvedStart || !post.approvedEnd) return null;

    let event = new Event({
        id: "",
        start: new Date(post.approvedStart),
        end: new Date(post.approvedEnd),
        title: `[발표] - ${post.title}`,
        memo: post.memo,
    });

    let id: string | null;
    if (eventId === undefined) id = await addEvent(calendarId, event);
    else {
        event.id = eventId;
        id = await updateEvent(calendarId, event);
    }

    if (id !== null) {
        event.id = id;
        post.approvedCalendarId = id;

        return event;
    }

    return null;
};

const syncCalendar = async (setting: Setting) => {
    await db.dataSource.transaction(async (transaction) => {
        const {updatedEvents, removedEvents, syncToken} = await getAllEvents(setting.calendarId, setting.syncToken);
        await transaction.getRepository(Event).save(updatedEvents);
        await transaction.getRepository(Event).remove(removedEvents);

        setting.syncToken = syncToken;
        await transaction.getRepository(Setting).save(setting);
    });
};

const init = async () => {
    await db.init();

    const settings = await db.settingRepository.find({});
    if (settings.length > 1) {
        console.log("Settings must be one or zero");
        process.exit(0);
    }

    if (settings.length === 0) {
        console.log("Initializing database...");

        let calendars = await getCalendarList();

        if (calendars.length === 0) {
            await createCalendar();
            calendars = await getCalendarList();
        }

        if (calendars.length > 1) {
            console.log("Calendars must be one");
            process.exit(0);
        }

        const calendarId = calendars[0].id;

        if (calendarId === undefined || calendarId === null) {
            console.log("Calendar ID is undefined");
            process.exit(0);
        }

        await updateCalendarSettings(calendarId);

        console.log(`Using calendar with ID: ${calendarId}`);
        const setting = db.settingRepository.create({
            calendarId: calendarId,
        });

        await db.settingRepository.save(setting);
    }

    const setting = await db.settingRepository.findOne({
        where: {},
    });
    if (setting === null) {
        console.log("Setting is null");
        process.exit(0);
    }

    console.log(`Start syncing calendar...`);
    await syncCalendar(setting);

    console.log(`Start validating calendar...`);
    await db.dataSource.transaction(async (transaction) => {
        const posts = await transaction.getRepository(Post).find({});
        const events = await transaction.getRepository(Event).find({});

        const eventsMap = new Map<string, Event>();
        events.forEach((event) => {
            eventsMap.set(event.id, event);
        });

        // Check if all events are in the database
        // If there are events of post that are not in the database, create a new event to the calendar
        for (let post of posts) {
            if (post.applicationCalendarId !== undefined) {
                const event = eventsMap.get(post.applicationCalendarId);
                if (event === undefined && post.applicationStart !== undefined && post.applicationEnd !== undefined) {
                    await _addApplicationEvent(setting.calendarId, post);
                } else if (event !== undefined) {
                    eventsMap.delete(event.id);
                }
            } else if (post.applicationStart !== undefined && post.applicationEnd !== undefined) {
                await _addApplicationEvent(setting.calendarId, post);
            }

            if (post.approvedCalendarId !== undefined) {
                const event = eventsMap.get(post.approvedCalendarId);
                if (event === undefined && post.approvedStart !== undefined && post.approvedEnd !== undefined) {
                    await _addApprovedEvent(setting.calendarId, post);
                } else if (event !== undefined) {
                    eventsMap.delete(event.id);
                }
            } else if (post.approvedStart !== undefined && post.approvedEnd !== undefined) {
                await _addApprovedEvent(setting.calendarId, post);
            }

            await transaction.save(post);
        }

        // If there are posts that are not in the database, delete the event
        for (let event of eventsMap.values()) {
            // If there are events that are not in the database, delete the event
            await removeEvent(setting.calendarId, event.id);
            await transaction.getRepository(Event).remove(event);
        }
    });

    console.log(`Syncing calendar after validating...`);
    await syncCalendar(setting);

    console.log(`Done!`);

    return {
        calendarId: setting.calendarId,
    };
};

const run = async (calendarId: string) => {
    console.log("Start syncing posts...");

    const dbPosts = new Map<number, Post>();
    for (let post of await db.postRepository.find({})) {
        dbPosts.set(post.id, post);
    }

    console.log("Get all posts...");
    let posts = await getAllPosts();
    console.log(`Got ${posts.length} posts`);
    posts = posts.filter((post) => {
        const tempPost = mapper.convertPostToTemporaryModel(post);
        const model = dbPosts.get(tempPost.id);

        let result = model === undefined || model.contentHash !== tempPost.contentHash;
        if (!result) {
            dbPosts.delete(tempPost.id);
        }
        return result;
    }); // need update

    if (posts.length > 0) {
        console.log(`Processing ${posts.length} posts...`);
        const bar = new ProgressBar("[:bar] :percent :etas", {
            total: posts.length,
            width: 20,
        });
        bar.render();
        const postModels: Post[] = [];
        let tmpPostModels: RawPostType[] = [];
        let size = 0;
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            if (size + post.content.length > 6000 || i + 1 === posts.length) {
                if (i + 1 === posts.length) {
                    tmpPostModels.push(post);
                }

                const tmpPosts = await mapper.convertPostsToModel(tmpPostModels);
                postModels.push(...tmpPosts);
                for (let j = 0; j < tmpPostModels.length; j++) {
                    bar.tick();
                }

                size = 0;
                tmpPostModels = [];
            }

            size += post.content.length;
            tmpPostModels.push(post);
        }
        bar.terminate();
        console.log("Extracted all posts");

        for (let post of postModels) {
            const model = dbPosts.get(post.id);
            dbPosts.delete(post.id);

            if (model === undefined) {
                await _addApplicationEvent(calendarId, post).then(async (ret) => {
                    if (ret !== null) {
                        post.applicationCalendarId = ret.id;
                        await db.postRepository.save(post);
                        await db.eventRepository.save(ret);
                    }
                });
                await _addApprovedEvent(calendarId, post).then(async (ret) => {
                    if (ret !== null) {
                        post.approvedCalendarId = ret.id;
                        await db.postRepository.save(post);
                        await db.eventRepository.save(ret);
                    }
                });

                await db.postRepository.save(post);
            } else {
                await db.eventRepository.findOneBy({
                    id: post.applicationCalendarId,
                }).then(async (event) => {
                    if (event !== null) {
                        if (post.applicationStart !== undefined && post.applicationEnd !== undefined) {
                            event = new Event({
                                id: event.id,
                                start: post.applicationStart,
                                end: post.applicationEnd,
                                title: post.title,
                                memo: post.contentHash,
                            });
                            await _addApplicationEvent(calendarId, post, event.id);
                            await db.eventRepository.save(event);
                        } else {
                            await removeEvent(calendarId, event.id);
                            await db.eventRepository.remove(event);
                            post.applicationCalendarId = undefined;
                        }
                    } else {
                        console.log("Event(application) is null", post);
                    }
                });

                await db.eventRepository.findOneBy({
                    id: post.approvedCalendarId,
                }).then(async (event) => {
                    if (event !== null) {
                        if (post.approvedStart !== undefined && post.approvedEnd !== undefined) {
                            event = new Event({
                                id: event.id,
                                start: post.approvedStart,
                                end: post.approvedEnd,
                                title: post.title,
                                memo: post.contentHash,
                            });
                            await _addApprovedEvent(calendarId, post, event.id);
                            await db.eventRepository.save(event);
                        } else {
                            await removeEvent(calendarId, event.id);
                            await db.eventRepository.remove(event);
                            post.applicationCalendarId = undefined;
                        }
                    } else {
                        console.log("Event(application) is null", post);
                    }
                });
            }
        }
    } else {
        console.log("No new posts");
    }

    console.log(`Deleting ${dbPosts.size} unmatched posts...`);
    for (let post of dbPosts.values()) {
        await db.postRepository.remove(post);

        if (post.applicationCalendarId !== undefined) {
            await removeEvent(calendarId, post.applicationCalendarId);
            await db.eventRepository.delete({id: post.applicationCalendarId});
        }
        if (post.approvedCalendarId !== undefined) {
            await removeEvent(calendarId, post.approvedCalendarId);
            await db.eventRepository.delete({id: post.approvedCalendarId});
        }
    }

    console.log("Done syncing posts!");
};

(async () => {
    const {calendarId} = await init();

    await run(calendarId);

    let task = cron.schedule("0 */6 * * *", () => run(calendarId));
    task.start();
    await new Promise(r => task.on("exit", r));
})().catch(console.log).finally(async () => {
    await db.dataSource.destroy();
    console.log("Database connection closed");
    process.exit(0);
});
