import { StatStorage } from '@/classes';
import { websocket } from '@/handlers/websocket';
import { api } from '@/api/api';

export async function bootstrap() {
    StatStorage.init().then(websocket).then(api);
}
