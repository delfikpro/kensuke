import { DataStorage, initDataStorage } from '@/classes';
import { websocket as initWebSocketApi } from '@/network/connection';
import { api as initRestApi } from '@/api/api';
import { initSessionStorage } from './session/session-storage';
import { logHistory } from './history/historydb';

export async function bootstrap() {

    await logHistory("00000000-0000-0000-0000-000000000000", 'kensuke', 0, 'start', null, null);

    initDataStorage()
        .then(initSessionStorage)
        .then(initWebSocketApi)
        .then(initRestApi);

}
