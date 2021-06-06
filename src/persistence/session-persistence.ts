import levelup, { LevelUp } from 'levelup';
import leveldown, { LevelDown } from 'leveldown';

export class SessionCoordinator {
    db: LevelUp;

    async init(): Promise<void> {
        this.db = levelup(leveldown('./sessiondb'));
    }

    async saveSessions(): Promise<void> {
        const a: string = (await this.db.get('name')) as string;
        
    }

}