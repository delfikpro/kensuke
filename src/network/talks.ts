import { MinecraftNode } from "@/classes";
import { Error, IncomingFrame, Packet, Sendable, V0Frame, V1Frame } from "@/types";
import { v4 as randomUUID } from 'uuid';

export const timeout = +process.env.STATSERVICE_TIMEOUT || 5000;

type Frame<T extends Packet> = {
    type: string;
    data: T;
};

export interface Talker {
    
    acceptRequest(frame: IncomingFrame): void;

    createTalk(frame?: IncomingFrame): Talk;

}

export class TalkerV0 implements Talker {

    runningRequests = new Map<string, (frame: V0Frame) => void>();

    constructor(public node: MinecraftNode) {}

    acceptRequest(frame: IncomingFrame) {
        if (frame.uuid) {
            const runningRequest = this.runningRequests.get(frame.uuid);
            if (runningRequest) runningRequest(frame);
        }
    }

    createTalk(frame?: IncomingFrame): Talk {
        return new TalkV0(frame?.uuid || randomUUID(), this);
    }

}

export class TalkerV1 implements Talker {

    runningRequests = new Map<number, (frame: V1Frame) => void>();
    counter: number = 0;

    constructor(public node: MinecraftNode) {}

    acceptRequest(frame: IncomingFrame) {
        const runningRequest = this.runningRequests.get(frame.talk);
        if (runningRequest) runningRequest(frame);
    }

    createTalk(frame?: IncomingFrame): Talk {
        return new TalkV1(frame?.talk || --this.counter, this);
    }

}

export interface Talk {
    send(sendable: Sendable<any>): void;

    sendAndAwait<T extends Packet>(sendable: Sendable<any>): Promise<T>;
}

export class TalkV0 implements Talk {
    constructor(public talkId: string, public talker: TalkerV0) {}

    send(sendable: Sendable<any>): void {
        this.talker.node.sendFrame({
            type: sendable[0],
            data: sendable[1],
            uuid: this.talkId,
        });
    }

    async sendAndAwait<T extends Packet>(sendable: Sendable<any>): Promise<T> {

        return new Promise<T>((resolve, reject) => {
            const wait = setTimeout(() => {
                this.talker.runningRequests.delete(this.talkId);
                reject({
                    type: 'error',
                    data: { errorLevel: 'TIMEOUT', errorMessage: 'Timeout' },
                });
            }, timeout);


            this.talker.runningRequests.set(this.talkId, frame => {
                clearTimeout(wait);
                this.talker.runningRequests.delete(frame.uuid);
                resolve(frame.data);
            });

            this.send(sendable);
        });
    }

    

}

export class TalkV1 implements Talk {
    constructor(public talkId: number, public talker: TalkerV1) {}

    send(sendable: Sendable<any>): void {
        this.talker.node.sendFrame({
            type: sendable[0],
            packet: sendable[1],
            talk: this.talkId,
        });
    }

    async sendAndAwait<T extends Record<any, any>>(sendable: Sendable<any>): Promise<T> {

        return new Promise<T>((resolve, reject) => {
            const wait = setTimeout(() => {
                this.talker.runningRequests.delete(this.talkId);
                reject({
                    type: 'error',
                    data: { errorLevel: 'TIMEOUT', errorMessage: 'Timeout' },
                });
            }, timeout);


            this.talker.runningRequests.set(this.talkId, frame => {
                clearTimeout(wait);
                this.talker.runningRequests.delete(frame.talk);
                if (frame.type == "error") reject(frame.packet);
                else resolve(frame.packet);
            });

            this.send(sendable);
        });
    }

    

}
