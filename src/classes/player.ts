import { Session } from '@/classes';
import { Scope, Stats } from '@/types';
import { getStorage } from '@/helpers';

const storage = getStorage();

export class Player {
    currentSession: Session;
    stats: Stats = {};

    constructor(public readonly uuid: string, public name: string) {}

    async getStats(scopes: Scope[]): Promise<Stats> {
        const stats: Stats = {};
        for (const scope of scopes) {
            let s = this.stats[scope.id];
            if (!s) {
                s = await storage.readData(scope, this.uuid);
                this.stats[scope.id] = s;
            }
            stats[scope.id] = s;
        }
        return stats;
    }

    toString(): string {
        return `${this.name} (${this.uuid})`;
    }
}
