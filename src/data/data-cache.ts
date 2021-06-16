
import { sessionStorage } from '@/session/session-storage';
import NodeCache from 'node-cache';
import { Dao } from './dao';

export const dataCache = new NodeCache({
    stdTTL: 60,
    checkperiod: 10,
    useClones: false,
    deleteOnExpire: false
}).on('expired', (key: string, value: Dao) => {
    let sessionsLeft = sessionStorage.getSessionsByDataId(value.id).length;
    if (sessionsLeft == 0) {
        dataCache.del(key);
    }
});

export function getDao(dataId: string): Dao {
    
    if (dataCache.has(dataId)) {
        const existing: Dao = dataCache.get(dataId);
        if (existing) return existing;
    }

    const dao = new Dao(dataId);
    dataCache.set(dataId, dao);

    return dao;
}



