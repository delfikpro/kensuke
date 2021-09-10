
import { sessionStorage } from '@/session/session-storage';

import { Dao } from './dao';

export type CacheEntry = {
    lastTouch: number,
    dao: Dao 
}

export var dataCache = new Map<string, CacheEntry>();

// export const dataCache = new NodeCache({
//     stdTTL: 60,
//     checkperiod: 10,
//     useClones: false,
//     deleteOnExpire: false
// }).on('expired', (key: string, value: Dao) => {
//     let sessionsLeft = sessionStorage.getSessionsByDataId(value.id).length;
//     if (sessionsLeft == 0) {
//         dataCache.del(key);
//     }
// });

export function updateCache() {
    const time = Date.now();
    if (time - lastCacheUpdate > 10000) {
        dataCache.forEach((v, k) => {
            if (v.lastTouch + 60000 < time && sessionStorage.getSessionsByDataId(k).length == 0) {
                dataCache.delete(k);
            }
        });
        lastCacheUpdate = Date.now();
    }
}

var lastCacheUpdate = Date.now();

export function getDao(dataId: string): Dao {
    
    if (dataCache.has(dataId)) {
        const entry = dataCache.get(dataId);
        entry.lastTouch = Date.now();

        updateCache();
        return entry.dao;
    }

    const dao = new Dao(dataId);
    dataCache.set(dataId, {
        lastTouch: Date.now(), 
        dao
    });

    updateCache();
    return dao;
}



