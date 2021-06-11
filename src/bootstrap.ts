import { StatStorage } from '@/classes';
import { websocket } from '@/network/connection';
import { api } from '@/api/api';

export async function bootstrap() {
    StatStorage.init().then(websocket).then(api);
}
