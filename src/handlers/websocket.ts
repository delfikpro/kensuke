import * as WebSocket from 'ws';
import { IncomingMessage } from 'http';

import { errorResponse, logger, playerMap, sessionMap, setStorage } from '@/helpers';
import { MinecraftNode, runningRequests, Session, StatStorage } from '@/classes';
import { MinecraftWebSocket, Sendable, Frame } from '@/types';
import * as messageHandlers from '@/handlers/message';

const nodes: MinecraftNode[] = [];

export function websocket($storage: StatStorage) {
    setStorage($storage);

    setInterval(() => {
        for (const node of nodes) {
            node.sendPacket(['keepAlive', {}]);
        }
    }, 5000);

    const wss = new WebSocket.Server({ port: +process.env.PORT || 8999 });
    logger.info('Ready!');

    wss.on('connection', (ws: MinecraftWebSocket, req: IncomingMessage) => {
        const address = req.connection.remoteAddress;
        const node = new MinecraftNode(ws as MinecraftWebSocket, address);
        node.log('Node connected');

        ws.on('close', async (code: number, reason: string) => {
            node.log('Node disconnected: ' + code + ' ' + reason);
            logger.info(`${address} disconnected: ${code} ${reason}`);
            const activeSessions: Session[] = [];
            for (const sessionId in sessionMap) {
                const session = sessionMap[sessionId];
                if (session.player.currentSession == session && session.ownerNode == node) {
                    activeSessions.push(session);
                }
            }
            for (const session of activeSessions) {
                delete sessionMap[session.sessionId];
                delete playerMap[session.player.uuid];
                logger.warn(`Abrupt restart caused session ${session.sessionId} of ${session.player.name} to end.`);
            }
            const index = nodes.indexOf(node);
            if (index >= 0) nodes.splice(index, 1);
        });

        nodes.push(node);

        ws.on('message', async (message: string) => {
            let response: Sendable<Record<any, any>>;
            let frame: Frame;
            // logger.debug(message);

            try {
                frame = JSON.parse(message);
            } catch (error) {
                if (node.account) {
                    logger.error(`Invalid packet from ${node.toString()}: `);
                    logger.error(error);
                }
                node.sendFrame({
                    type: 'error',
                    data: {
                        error_code: -2,
                        error_message: 'Invalid packet',
                    },
                });
                return;
            }

            try {
                // @ts-ignore TODO: fix it как нибудь
                const handle = messageHandlers[frame.type];

                if (frame.type != 'auth' && !node.account) response = errorResponse('FATAL', 'Unauthorized');
                else if (handle) response = await handle(node, frame.data);
            } catch (error) {
                response = errorResponse('SEVERE', 'Internal error');
            }

            if (frame.uuid) {
                const runningRequest = runningRequests[frame.uuid];
                if (runningRequest) runningRequest(frame);
            }

            if (response) {
                if (response[0] == 'error') {
                    node.log(`Processing ${frame.type} packet resulted in an error`, 'warn');
                    node.log('Request: ' + JSON.stringify(frame), 'warn');
                    node.log('Response: ' + JSON.stringify(response[1]), 'warn');
                }

                // logger.debug('Sending %s to node %s', JSON.stringify(response), node.toString());
                node.sendFrame({
                    type: response[0],
                    data: response[1],
                    uuid: frame.uuid,
                });
            }
        });
    });
}
