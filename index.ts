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
import {Post} from "./lib/application/type/db/post.js";
import {BatchQueue} from "./lib/application/queue/batchQueue.js";

const _addApplicationEvent = async (calendarId: string, post: Post, eventId?: string) => {
    if (!post.applicationStart || !post.applicationEnd) return null;

    let event = new Event({
        id: "",
        start: post.applicationStart,
        end: post.applicationEnd,
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
        start: post.approvedStart,
        end: post.approvedEnd,
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
        await transaction.getRepository(Event).save(updatedEvents, {
            chunk: 500,
        });
        await transaction.getRepository(Event).remove(removedEvents, {
            chunk: 500,
        });

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

        if (posts.length > 0) {
            const bar = new ProgressBar("[:bar] :current/:total (:percent) :etas", {
                total: posts.length,
                width: 20,
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
                bar.tick();
            }

            bar.terminate();
        }

        if (eventsMap.size > 0) {
            const bar = new ProgressBar("[:bar] :current/:total (:percent) :etas", {
                total: eventsMap.size,
                width: 20,
            });

            // If there are posts that are not in the database, delete the event
            for (let event of eventsMap.values()) {
                // If there are events that are not in the database, delete the event
                await removeEvent(setting.calendarId, event.id);
                await transaction.getRepository(Event).remove(event);
                bar.tick();
            }

            bar.terminate();
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
    console.log(`${(new Date()).toLocaleString()} > Start syncing posts...`);

    const dbPosts = new Map<number, Post>();
    for (let post of await db.postRepository.find({})) {
        dbPosts.set(post.id, post);
    }

    console.log("Getting all posts...");
    let posts = await getAllPosts();
    console.log(`Got ${posts.length} posts`);
    posts = posts.filter((post) => {
        const tempPost = mapper.convertPostToTemporaryModel(post);
        const model = dbPosts.get(tempPost.id);

        let result = model === undefined || model.contentHash !== tempPost.contentHash || model.attachmentHash !== tempPost.attachmentHash;
        if (!result) {
            dbPosts.delete(tempPost.id);
        }
        return result;
    }); // need update

    if (posts.length > 0) {
        console.log(`Processing ${posts.length} posts...`);
        let bar = new ProgressBar("[:bar] :current/:total (:percent) :etas", {
            total: posts.length,
            width: 20,
        });
        bar.render();
        const batchQueue = new BatchQueue(Math.min(50, posts.length));
        const postModels: Post[] = [];
        for (let post of posts) {
            const model = (() => mapper.convertPostToModel(post).then((ret) => {
                bar.tick();
                postModels.push(ret);
            }));
            batchQueue.addTask(model);
            // postModels.push(model);
        }
        await batchQueue.run();
        bar.terminate();
        console.log("Extracted all posts");

        console.log("Registering schedule...");
        bar = new ProgressBar("[:bar] :current/:total (:percent) :etas", {
            total: postModels.length,
            width: 20,
        });
        bar.render();
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
                            post.approvedCalendarId = undefined;
                        }
                    } else {
                        console.log("Event(application) is null", post);
                    }
                });
            }
            bar.tick();
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

    cron.schedule("0 0 * * *", () => run(calendarId));
    cron.schedule("0 10 * * *", () => run(calendarId));
    cron.schedule("0 12 * * *", () => run(calendarId));
    cron.schedule("0 14 * * *", () => run(calendarId));
    cron.schedule("0 16 * * *", () => run(calendarId));
    cron.schedule("0 18 * * *", () => run(calendarId));
})().catch(async (e) => {
    console.error(e);

    await db.dataSource.destroy();
    console.log("Database connection closed");
    process.exit(0);
});
