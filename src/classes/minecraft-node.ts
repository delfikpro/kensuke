import { v4 as randomUUID } from 'uuid';

import { Account, MinecraftWebSocket, Scope, Sendable } from '@/types';
import * as Packets from '@/types/packets';

export const timeout = +process.env.STATSERVICE_TIMEOUT || 5000;

export const runningRequests: Record<
    string,
    (frame: Packets.Frame) => void
> = {};

export class MinecraftNode {
    isAlive = true;
    name: string;
    account: Account;
    scopes: Scope[] = [];

    constructor(readonly socket: MinecraftWebSocket, readonly address: string) {
        socket.minecraftNode = this;
    }

    toString(): string {
        return this.name;
    }

    sendRequest(sendable: Sendable<Packets.Packet>): Promise<Packets.Frame> {
        const frame: Packets.Frame = {
            type: sendable[0],
            data: sendable[1],
            uuid: randomUUID(),
        };

        return new Promise<Packets.Frame>(resolve => {
            const wait = setTimeout(() => {
                delete runningRequests[frame.uuid];
                resolve({
                    type: 'error',
                    data: { errorLevel: 'TIMEOUT', errorMessage: 'Timeout' },
                });
            }, timeout);

            runningRequests[frame.uuid] = frame => {
                clearTimeout(wait);
                delete runningRequests[frame.uuid];
                resolve(frame);
            };

            this.sendFrame(frame);
        });
    }

    sendPacket(sendable: Sendable<Packets.Packet>): void {
        const frame: Packets.Frame = {
            type: sendable[0],
            data: sendable[1],
        };

        this.sendFrame(frame);
    }

    sendFrame(frame: Packets.Frame): void {
        this.socket.send(JSON.stringify(frame));
    }

    getScope(scopeId: string): Scope {
        for (const scope of this.scopes) {
            if (scope.id == scopeId) return scope;
        }
    }
}
