import { Session } from '@/classes';
import { Scope, KensukeData } from '@/types';
import { dataStorage } from './data-storage';

//const storage = getStorage();

export class Dao {
    stats: KensukeData = {};

    constructor(public readonly id: string) {}

    async getData(scopes: Scope[]): Promise<KensukeData> {
        const stats: KensukeData = {};
        for (const scope of scopes) {
            let s = this.stats[scope.id];
            if (!s) {
                s = await dataStorage.readData(scope, this.id);
                this.stats[scope.id] = s;
            }
            stats[scope.id] = s;
        }
        return stats;
    }
    
}
