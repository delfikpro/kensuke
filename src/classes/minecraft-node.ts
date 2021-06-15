import { v4 as randomUUID } from 'uuid';

import { Account, MinecraftWebSocket, Scope, Sendable, Packet, V0Frame, V1Frame, IncomingFrame } from '@/types';
import { logger } from '@/helpers';
import { Talk, Talker, TalkerV0, TalkerV1, TalkV0 } from '@/network/talks';
import { Session } from 'inspector';

export const timeout = +process.env.STATSERVICE_TIMEOUT || 5000;


export let nodeCounter = 0;

export class MinecraftNode {

    talker: Talker;

    _version: number;
    set version(value: number) {
        this._version = value
        this.talker = this.version >= 1 ? new TalkerV1(this) : new TalkerV0(this);
    }
    get version() {
        return this._version;
    }
    isAlive = true;
    account: Account;
    scopes: Scope[] = [];
    nodeIndex = ++nodeCounter;
    nodeName = 'unknown';

    ownedSessions: string[] = [];

    constructor(readonly socket: MinecraftWebSocket, readonly address: string) {
        socket.minecraftNode = this;
    }

    hasAccessTo(scope: string) {
        return this.account.allowedScopes.includes(scope.replace("players:", ""));
    }

    send(sendable: Sendable<any>) {
        this.talker?.createTalk()?.send(sendable);
    }

    async sendAndAwait<T extends Packet>(sendable: Sendable<any>): Promise<T> {
        return this.talker.createTalk().sendAndAwait(sendable);
    }

    toString(): string {
        return `${this.nodeName}/${this.account?.id || "unathorized"}/node-${this.nodeIndex}`;
    }

    log(message: string, level = 'info'): void {
        logger.log(level, this.toString() + ' > ' + message);
    }

    sendFrame(frame: V0Frame | V1Frame): void {
        logger.debug("to " + this.nodeName + ": " +JSON.stringify(frame));
        this.socket.send(JSON.stringify(frame));
    }

}
