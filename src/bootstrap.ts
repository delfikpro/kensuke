import { StatStorage } from '@/classes';
import { websocketHandler } from '@/websocket-handler';

export async function bootstrap() {
    StatStorage.init().then(websocketHandler);
}
