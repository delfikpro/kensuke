import * as WebSocket from 'ws';
import { IncomingMessage } from 'http';

import { errorResponse, logger } from '@/helpers';
import { MinecraftNode, Session, DataStorage } from '@/classes';
import { MinecraftWebSocket, Sendable, V0Frame, V1Frame, IncomingFrame } from '@/types';
import * as messageHandlers from '@/network/logic';

export const nodes: MinecraftNode[] = [];

export function websocket() {

    setInterval(() => {
        for (const node of nodes) {
            node.send(['keepAlive', {}]);
        }
    }, 5000);

    const port = +process.env.PORT || 8999
    const wss = new WebSocket.Server({ port });
    logger.info(`WebSocket API is available at port :${port}`);

    wss.on('connection', (ws: MinecraftWebSocket, req: IncomingMessage) => {
        const address = req.connection.remoteAddress;
        const node = new MinecraftNode(ws as MinecraftWebSocket, address);
        node.log('Node connected');

        ws.on('close', async (code: number, reason: string) => {
            node.log('Node disconnected: ' + code + ' ' + reason);
            logger.info(`${address} disconnected: ${code} ${reason}, it had ${node.ownedSessions.length} owned sessions.`);
            const index = nodes.indexOf(node);
            if (index >= 0) nodes.splice(index, 1);
        });

        nodes.push(node);

        ws.on('message', async (message: string) => {
            let response: Sendable<Record<any, any>>;
            let frame: IncomingFrame;
            logger.debug(`from ${node.nodeName}: ${message}`);

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
                else if (handle) response = await handle(node, frame.data || frame.packet);
            } catch (error) {
                response = errorResponse('SEVERE', 'Internal error');
                logger.error('Internal error', error);
                logger.error(error.stack);
            }

            node.talker?.acceptRequest(frame);

            if (response) {
                if (response[0] == 'error') {
                    node.log(`Processing ${frame.type} packet resulted in an error`, 'warn');
                    node.log('Request: ' + JSON.stringify(frame), 'warn');
                    node.log('Response: ' + JSON.stringify(response[1]), 'warn');
                }

                // logger.debug('Sending %s to node %s', JSON.stringify(response), node.toString());

                node.talker.createTalk(frame).send(response);
            }
        });
    });
}
