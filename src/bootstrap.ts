import { StatStorage } from '@/classes';
import { websocket } from '@/handlers/websocket';

export async function bootstrap() {
    StatStorage.init().then(websocket);
}
