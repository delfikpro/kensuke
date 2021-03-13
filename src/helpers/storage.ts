import { Session, StatStorage, Player } from '@/classes';
import { UUID } from '@/types';

let storage: StatStorage;

export function setStorage(internalStorage: StatStorage): void {
    storage = internalStorage;
}

export function getStorage(): StatStorage {
    return storage;
}

// Можно заменить на встроенный метод Map();
export const playerMap: Record<UUID, Player> = {};
export const sessionMap: Record<UUID, Session> = {};

/*
Deprecated

export const handlerMap: Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
> = {};
*/
