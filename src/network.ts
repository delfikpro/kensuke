import * as Packets from './packets';
import { v4 as randomUUID } from 'uuid';
import { Account } from './authorization';
import * as WebSocket from 'ws';

export type Sendable<T extends object> = [packetClass: string, data: T];

export class Realm {

    constructor(
        readonly name: string,
        readonly node: MinecraftNode
    ) { }

    sendPacket(sendable: Sendable<Packets.Packet>): void {
        this.node.sendPacket(sendable, this);
    }

    sendRequest(sendable: Sendable<Packets.Packet>): Promise<Packets.Frame> {
        return this.node.sendRequest(sendable, this);
    }

}

export interface MinecraftWebSocket extends WebSocket {

    minecraftNode: MinecraftNode;

}

export const runningRequests: Record<string, (frame: Packets.Frame) => void> = {};

export class MinecraftNode {

    isAlive: boolean = true;
    account: Account;
    readonly realms: Record<string, Realm> = {};

    constructor(readonly socket: MinecraftWebSocket) {
        socket.minecraftNode = this;
    }

    sendRequest(sendable: Sendable<Packets.Packet>, realm?: Realm): Promise<Packets.Frame> {

        let frame: Packets.Frame = {
            type: sendable[0],
            data: sendable[1],
            realm: realm?.name,
            uuid: randomUUID()
        }

        let promise = new Promise<Packets.Frame>((resolve, reject) => {
            let wait = setTimeout(() => {
                delete runningRequests[frame.uuid]
                reject('Timeout');
            }, 5000);

            runningRequests[frame.uuid] = frame => {
                clearTimeout(wait);
                delete runningRequests[frame.uuid]
                resolve(frame);
            }

            this.sendFrame(frame);
        });

        return promise;
    }

    sendPacket(sendable: Sendable<Packets.Packet>, realm?: Realm): void {

        let frame: Packets.Frame = {
            type: sendable[0],
            realm: realm?.name,
            data: sendable[1]
        }

        this.sendFrame(frame);

    }

    sendFrame(frame: Packets.Frame): void {
        this.socket.send(JSON.stringify(frame));
    }

}