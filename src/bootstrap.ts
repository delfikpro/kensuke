import { DataStorage, initDataStorage } from '@/classes';
import { websocket as initWebSocketApi } from '@/network/connection';
import { api as initRestApi } from '@/api/api';
import { initSessionStorage } from './session/session-storage';
import { init as initHistoryDb, logHistory } from './history/historydb';

export async function bootstrap() {

    initHistoryDb();

    initDataStorage()
        .then(initSessionStorage)
        .then(initWebSocketApi)
        .then(initRestApi);

}
