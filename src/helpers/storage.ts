import { MinecraftNode, Session, StatStorage, Player } from '@/classes';
import * as Packets from '@/types/packets';
import { Sendable } from '@/types';

let storage: StatStorage;

export function setStorage(internalStorage: StatStorage): void {
    storage = internalStorage;
}

export function getStorage(): StatStorage {
    return storage;
}

export const playerMap: Record<Packets.UUID, Player> = {};
export const sessionMap: Record<Packets.UUID, Session> = {};
export const handlerMap: Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
> = {};
