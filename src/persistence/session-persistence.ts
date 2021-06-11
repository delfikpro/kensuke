import levelup, { LevelUp } from 'levelup';
import leveldown, { LevelDown } from 'leveldown';
import { Session } from '@/classes';

export class SessionCoordinator {
    db: LevelUp;

    async init(): Promise<void> {
        this.db = levelup(leveldown('./sessiondb'));
    }

    async saveSessions(): Promise<void> {
        const a: string = (await this.db.get('name')) as string;
    }

    async createSession(session: Session) {
        this.db.put(session.sessionId, session)
    }

}