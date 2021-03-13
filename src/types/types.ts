import * as WebSocket from 'ws';
import { MinecraftNode } from '@/classes/minecraft-node';

export type Stats = Record<string, any>;

export type PlayerLockState = {
    id: string;
    session: string;
    realm: string;
};

export type Account = {
    id: string;
    allowedScopes: string[];
    passwordHash: string;
};

export type Scope = {
    id: string;
    createdBy: string;
    createdAt: number;
};

export type Sendable<T extends Record<any, any>> = [
    packetClass: string,
    data: T,
];

export interface MinecraftWebSocket extends WebSocket {
    minecraftNode: MinecraftNode;
}
