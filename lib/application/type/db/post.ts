import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity("post")
export class Post {
    @PrimaryColumn({type: "int"})
    id!: number;

    @Column({type: "text"})
    title!: string;

    @Column({type: "text"})
    memo!: string;

    @Column({type: "varchar", length: 64})
    contentHash!: string;

    @Column({type: "datetime", nullable: true})
    applicationStart?: Date;

    @Column({type: "datetime", nullable: true})
    applicationEnd?: Date;

    @Column({type: "datetime", nullable: true})
    approvedStart?: Date;

    @Column({type: "datetime", nullable: true})
    approvedEnd?: Date;

    @Column({type: "text", nullable: true})
    applicationCalendarId?: string;

    @Column({type: "text", nullable: true})
    approvedCalendarId?: string;

    constructor(opts?: Partial<Post>) {
        if (!opts) return;

        Object.assign(this, opts);
    }
}

export interface RawPostType {
    boardId: number,
    nttSj: string,
    content: string,
}
