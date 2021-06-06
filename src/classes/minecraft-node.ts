import { v4 as randomUUID } from 'uuid';

import { Account, MinecraftWebSocket, Scope, Sendable, Packet, V0Frame, V1Frame, IncomingFrame } from '@/types';
import { logger } from '@/helpers';
import { Talk, Talker, TalkerV0, TalkerV1, TalkV0 } from '@/network/talks';

export const timeout = +process.env.STATSERVICE_TIMEOUT || 5000;


export let nodeCounter = 0;

export class MinecraftNode {

    talker: Talker;

    _version: number;
    set version(value: number) {
        this._version = value
        this.talker = this.version == 0 ? new TalkerV0(this) : new TalkerV1(this);
    }
    isAlive = true;
    name: string;
    account: Account;
    scopes: Scope[] = [];
    nodeIndex = ++nodeCounter;
    nodeName = 'unknown';

    constructor(readonly socket: MinecraftWebSocket, readonly address: string) {
        socket.minecraftNode = this;
    }


    send(sendable: Sendable<any>) {
        this.talker?.createTalk()?.send(sendable);
    }

    async sendAndAwait<T extends Packet>(sendable: Sendable<any>): Promise<T> {
        return this.talker.createTalk().sendAndAwait(sendable);
    }

    toString(): string {
        return `${this.nodeName}/${this.account?.id || this.address}/node-${this.nodeIndex}`;
    }

    log(message: string, level = 'info'): void {
        logger.log(level, this.toString() + ' > ' + message);
    }

    sendFrame(frame: V0Frame | V1Frame): void {
        this.socket.send(JSON.stringify(frame));
    }

    resolveFrame(frame: IncomingFrame): void {

        const data = frame.packet || frame.data;
        const talkId = frame.uuid || frame.talk;

    }

    getScope(scopeId: string): Scope {
        for (const scope of this.scopes) {
            if (scope.id == scopeId) return scope;
        }
    }
}
