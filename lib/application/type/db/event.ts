import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity("event")
export class Event {
    @PrimaryColumn({type: "varchar", length: 64})
    id!: string;

    @Column({type: "datetime"})
    start!: Date;

    @Column({type: "datetime"})
    end!: Date;

    @Column({type: "text", nullable: true})
    title?: string | null;

    @Column({type: "text", nullable: true})
    memo?: string | null;

    constructor(opts: {
        id: string,
        start: Date,
        end: Date,
        title?: string | null,
        memo?: string | null
    }) {
        if (!opts) return;

        this.id = opts.id;
        this.start = opts.start;
        this.end = opts.end;
        this.title = opts.title;
        this.memo = opts.memo;
    }
}
