import levelup, { LevelUp } from 'levelup';
import leveldown, { LevelDown } from 'leveldown';
import { logger } from '@/helpers';
import { UUID } from '@/types';
import { rmSync } from 'fs';

export type StoredSession = {
    readonly sessionId: string,
    readonly dataId: string,
    readonly node: string,
    readonly account: string,
    readonly time: number,
    readonly scopes: string[],
    hadWrites: boolean,
    firstFailTime: number,
};

export var sessionStorage: SessionStorage

export async function initSessionStorage() {
    sessionStorage = new SessionStorage();
    await sessionStorage.init();

    let i = 0;

    await new Promise((resolve, n) => {
        sessionStorage.sessionDb.createReadStream()
            .on('data', entry => {
                const session: StoredSession = JSON.parse(entry.value);
                i++;
                console.log(entry.key.toString());
                sessionStorage.sessionMap.set(session.sessionId, session);
            })
            .on('close', resolve).resume();
    });

    logger.info(`There were ${i} sessions left in the session database.`)

    await sessionStorage.sessionDb.close();
    rmSync('./sessiondb', {
        recursive: true, 
        force: true
    });

    await sessionStorage.init();


}

export class SessionStorage {

    sessionDb: LevelUp;

    sessionMap: Map<UUID, StoredSession> = new Map();

    async init(): Promise<void> {
        this.sessionDb = levelup(leveldown('./sessiondb'))
    }

    async writeSession(session: StoredSession): Promise<void> {
        // const stored: StoredSession = {
        //     session: session.sessionId,
        //     owner: session.ownerNode.toString(),
        //     time: Date.now(),
        //     scopes: session.lockedScopes.map(s => s.id).join(",")
        // }
        this.sessionMap.set(session.sessionId, session);
        return this.sessionDb.put(session.sessionId, JSON.stringify(session));
    }

    getSession(sessionId: string): StoredSession {

        return this.sessionMap.get(sessionId);
        // return JSON.parse(await this.sessionDb.get(dataId, {asBuffer: false}));
    }

    getSessionsByDataId(dataId: string) {
        let result: StoredSession[] = [];
        for (let entry of this.sessionMap) {
            const session = entry[1];
            if (session.dataId == dataId)
                result.push(session);
        }
        return result;
    }

    getLatestSessionWithWrites(dataId: string) {
        
        const sessions = this.getSessionsByDataId(dataId)
                .filter(s => s.hadWrites)
                .sort(s => s.time);

        return sessions.length ? sessions[sessions.length - 1] : undefined;
    }

    async removeSession(sessionId: string): Promise<void> {
        console.log('before delete: ' + this.sessionMap.size);
        this.sessionMap.delete(sessionId);
        console.log('after delete: ' + this.sessionMap.size);
        return this.sessionDb.del(sessionId);
    }

}