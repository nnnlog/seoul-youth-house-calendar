import {Column, Entity, PrimaryGeneratedColumn} from "typeorm";

@Entity("setting")
export class Setting {
    @PrimaryGeneratedColumn({type: "int"})
    id!: number;

    @Column({type: "text"})
    calendarId!: string;

    @Column({type: "text", nullable: true})
    syncToken?: string;
}
