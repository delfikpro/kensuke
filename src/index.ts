import * as WebSocket from 'ws';
import * as Packets from './packets';
import { StatStorage, Stats } from './storage';
import { Account, authorize } from './authorization';
import { MinecraftNode, MinecraftWebSocket, runningRequests, Sendable } from './network';
import { errorResponse, handlerMap, logger } from './stat-service';

//initialize the WebSocket server instance
const wss = new WebSocket.Server({ port: +process.env.PORT || 8999 });
logger.info('Ready!')

wss.on('connection', (ws: WebSocket) => {

    let node = new MinecraftNode(ws as MinecraftWebSocket);

    ws.on('message', async (message: string) => {

        let response: Sendable<object>;
        let frame: Packets.Frame;

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
                    error_message: 'Invalid packet'
                }
            });
            return
        }   

        try {

            let handle = handlerMap[frame.type];
            let realm = node.realms[frame.realm];

            if (frame.type != 'auth' && !node.account)
                response = errorResponse(1, 'Unauthorized');
            else if (handle)
                response = await handle(node, realm, frame.data);

        } catch (error) {
            response = errorResponse(-1, 'Internal error');
            console.log(error);
        }


        if (frame.uuid) {
            let runningRequest = runningRequests[frame.uuid];
            if (runningRequest) runningRequest(frame);
        }

        if (response) {
            logger.debug('Sending %s to realm %s', JSON.stringify(response), frame.realm)
            node.sendFrame({
                type: response[0],
                data: response[1],
                realm: frame.realm,
                uuid: frame.uuid
            });
        }

    });

    //send immediatly a feedback to the incoming connection    
    ws.send('Hi there, I am a WebSocket server');
});
