
import { Dao } from '@/classes';
import { KensukeData, UUID } from '@/types';
import { createClient, RedisClientType } from 'redis'

var client: RedisClientType<any>

export async function initCache() {

    client = createClient({
        url: `redis://${process.env["REDIS_URL"]}`
    });

    client.on('error', (err) => {
        console.log('Redis client error', err);
    })

    await client.connect();

}

export async function getDao(dataId: UUID): Promise<Dao> {
    let dao = new Dao(dataId);
    let cachedJson = await client.get(dataId);
    if (cachedJson) dao.stats = JSON.parse(cachedJson);
    return dao;
}

export async function cache(dataId: UUID, data: KensukeData) {
    await client.set(dataId, JSON.stringify(data), {
        EX: 60 
    });
}

