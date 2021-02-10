import * as Packets from './packets';
import { v4 as randomUUID } from 'uuid';
import { Account } from './authorization';
import * as WebSocket from 'ws';
import { time } from 'console';

export const timeout = +process.env.STATSERVICE_TIMEOUT || 5000;

export type Sendable<T extends object> = [packetClass: string, data: T];

export interface MinecraftWebSocket extends WebSocket {

    minecraftNode: MinecraftNode;

}

export const runningRequests: Record<string, (frame: Packets.Frame) => void> = {};

export class MinecraftNode {

    isAlive: boolean = true;
    name: string;
    account: Account;

    constructor(
        readonly socket: MinecraftWebSocket,
        readonly address: string,
    ) {
        socket.minecraftNode = this;
    }

    toString(): string {
        return this.account.login
    }

    sendRequest(sendable: Sendable<Packets.Packet>): Promise<Packets.Frame> {

        let frame: Packets.Frame = {
            type: sendable[0],
            data: sendable[1],
            uuid: randomUUID()
        }

        let promise = new Promise<Packets.Frame>((resolve, reject) => {
            let wait = setTimeout(() => {
                delete runningRequests[frame.uuid]
                resolve({type: "error", data: {"errorCode": 42, "errorMessage": "Timeout"}});
            }, timeout);

            runningRequests[frame.uuid] = frame => {
                clearTimeout(wait);
                delete runningRequests[frame.uuid]
                resolve(frame);
            }

            this.sendFrame(frame);
        });

        return promise;
    }

    sendPacket(sendable: Sendable<Packets.Packet>): void {

        let frame: Packets.Frame = {
            type: sendable[0],
            data: sendable[1]
        }

        this.sendFrame(frame);

    }

    sendFrame(frame: Packets.Frame): void {
        this.socket.send(JSON.stringify(frame));
    }

}