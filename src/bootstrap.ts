import { DataStorage, initDataStorage } from '@/classes';
import { websocket as initWebSocketApi } from '@/network/connection';
import { api as initRestApi } from '@/api/api';
import { initSessionStorage } from './session/session-storage';

export async function bootstrap() {

    initDataStorage()
        .then(initSessionStorage)
        .then(initWebSocketApi)
        .then(initRestApi);

}
