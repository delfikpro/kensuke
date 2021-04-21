import { Session } from '@/classes';
import { Scope, KensukeData } from '@/types';
import { getStorage } from '@/helpers';

//const storage = getStorage();

export class Player {
    currentSession: Session;
    saveOwner: string;
    stats: KensukeData = {};

    constructor(public readonly uuid: string, public name: string) {}

    async getStats(scopes: Scope[]): Promise<KensukeData> {
        const stats: KensukeData = {};
        for (const scope of scopes) {
            let s = this.stats[scope.id];
            if (!s) {
                s = await getStorage().readData(scope, this.uuid);
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
