import { Session, Dao } from '@/classes';
import { UUID } from '@/types';

// Можно заменить на встроенный метод Map();
// export const dataCache: Map<string, Dao> = new Map();
// export const sessionMap: Record<UUID, Session> = {};

/*
Deprecated

export const handlerMap: Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
> = {};
*/
