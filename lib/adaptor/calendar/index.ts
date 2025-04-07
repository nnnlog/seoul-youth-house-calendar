import {calendar_v3, Auth} from "googleapis";
import * as process from "node:process";
import qs from "querystring";
import {Event} from "../../application/type/db/event.js";

const calendar = new calendar_v3.Calendar({
    auth: new Auth.GoogleAuth({
        keyFilename: "./key.json",
        scopes: ["https://www.googleapis.com/auth/calendar"],
    }),
});

export const getCalendarList = async () => {
    const res = await calendar.calendarList.list();
    return res.data.items ?? [];
};

export const createCalendar = async () => {
    const res = await calendar.calendars.insert({
        requestBody: {
            summary: "서울시 청년안심주택 공고",
            timeZone: "Asia/Seoul",
        }
    });

    console.log("Calendar created: ", res.data);

    return res.status === 200;
};

export const updateCalendarSettings = async (calendarId: string) => {
    if (process.env.OWNER_GMAIL !== undefined) {
        await calendar.acl.insert({
            calendarId: calendarId,
            requestBody: {
                role: "owner",
                scope: {
                    type: "user",
                    value: process.env.OWNER_GMAIL,
                }
            }
        });
    }

    await calendar.acl.insert({
        calendarId: calendarId,
        requestBody: {
            role: "reader",
            scope: {
                type: "default",
            }
        }
    });

    console.log(`Calendar updated: https://calendar.google.com/calendar/embed?src=${qs.escape(calendarId)}`);
};

const parseDate = (date?: calendar_v3.Schema$EventDateTime) => {
    if (!date) return new Date(0);

    if (date.date) {
        return new Date(date.date);
    }

    if (date.dateTime) {
        return new Date(date.dateTime);
    }

    return new Date(0);
};

export const getAllEvents = async (calendarId: string, syncToken?: string) => {
    const updated: Event[] = [], removed: Event[] = [];
    let pageToken: string | undefined = undefined;

    while (true) {
        const res = await calendar.events.list({
            calendarId: calendarId,
            syncToken: syncToken,
            pageToken: pageToken ?? undefined,
            maxResults: 2500,
        });

        removed.push(...res.data.items?.filter(e => e.status === "cancelled").map(e => new Event({
            id: e.id || "",
            start: new Date(0),
            end: new Date(0),
            title: e.summary,
            memo: e.description,
        })) ?? []);

        updated.push(...res.data.items?.filter(e => e.status === "confirmed").map(e => new Event({
            id: e.id || "",
            start: parseDate(e.start),
            end: parseDate(e.end),
            title: e.summary,
            memo: e.description,
        })) ?? []);

        if (res.data.nextSyncToken) {
            return {
                updatedEvents: updated,
                removedEvents: removed,
                syncToken: res.data.nextSyncToken,
            };
        }

        pageToken = (res.data.nextPageToken ?? undefined) as (string | undefined);
    }
};

export const addEvent = async (calendarId: string, event: Event) => {
    const checkIfMidnight = (date: Date) => {
        return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
    };
    const toYearMonthDay = (date: Date) => {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    };

    const allTime = checkIfMidnight(event.start) && checkIfMidnight(event.end);

    const res = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: {
            start: {
                date: allTime ? toYearMonthDay(event.start) : undefined,
                dateTime: allTime ? undefined : event.start.toISOString(),
                timeZone: "Asia/Seoul",
            },
            end: {
                date: allTime ? toYearMonthDay(event.end) : undefined,
                dateTime: allTime ? undefined : event.end.toISOString(),
                timeZone: "Asia/Seoul",
            },
            summary: event.title,
            description: event.memo,
        }
    });

    return res.data.id ?? null;
};

export const removeEvent = async (calendarId: string, eventId: string) => {
    const res = await calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId,
    });

    return res.status === 204;
};

export const updateEvent = async (calendarId: string, event: Event) => {
    const checkIfMidnight = (date: Date) => {
        return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
    };
    const toYearMonthDay = (date: Date) => {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
    };

    const allTime = checkIfMidnight(event.start) && checkIfMidnight(event.end);

    const res = await calendar.events.update({
        calendarId: calendarId,
        eventId: event.id,
        requestBody: {
            start: {
                date: allTime ? toYearMonthDay(event.start) : undefined,
                dateTime: allTime ? undefined : event.start.toISOString(),
                timeZone: "Asia/Seoul",
            },
            end: {
                date: allTime ? toYearMonthDay(event.end) : undefined,
                dateTime: allTime ? undefined : event.end.toISOString(),
                timeZone: "Asia/Seoul",
            },
            summary: event.title,
            description: event.memo,
        }
    });

    return res.data.id ?? null;
};
