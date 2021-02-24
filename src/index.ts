import * as WebSocket from 'ws';
import * as Packets from './packets';
import { StatStorage, Stats, init as initStorage } from './storage';
import { MinecraftNode, MinecraftWebSocket, runningRequests, Sendable } from './network';
import { Session, errorResponse, handlerMap, playerMap, sessionMap } from './stat-service';
import * as winston from 'winston';
import { IncomingMessage } from 'http';

export var storage: StatStorage


const logFormat = [
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({stack: true}),
    winston.format.splat(),
    winston.format.simple(),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
];

export const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(...logFormat),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                ...logFormat
            )
        })
    ]
});


initStorage().then($storage => {

    storage = $storage;
    
    const wss = new WebSocket.Server({ port: +process.env.PORT || 8999 });
    logger.info('Ready!')
    
    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    
        let address = req.connection.remoteAddress;
        let node = new MinecraftNode(ws as MinecraftWebSocket, address);
        logger.info(`${address} connected.`);

        ws.on('close', async (code: number, reason: string) => {
            logger.info(`${address} disconnected: ${code} ${reason}`)
            let activeSessions: Session[] = [];
            for (let sessionId in sessionMap) {
                let session = sessionMap[sessionId]
                if (session.player.currentSession == session && session.ownerNode == node) {
                    activeSessions.push(session)
                }
            }
            for (let session of activeSessions) {
                delete sessionMap[session.sessionId]
                delete playerMap[session.player.uuid]
                console.log(`Abrupt restart caused session ${session.sessionId} of ${session.player.name} to end.`)
            }
        })
    
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
    
                if (frame.type != 'auth' && !node.account)
                    response = errorResponse('FATAL', 'Unauthorized');
                else if (handle)
                    response = await handle(node, frame.data);
    
            } catch (error) {
                response = errorResponse('SEVERE', 'Internal error');
                logger.warn(error);
            }
    
    
            if (frame.uuid) {
                let runningRequest = runningRequests[frame.uuid];
                if (runningRequest) runningRequest(frame);
            }
    
            if (response) {
                logger.debug('Sending %s to node %s', JSON.stringify(response), node.toString())
                node.sendFrame({
                    type: response[0],
                    data: response[1],
                    uuid: frame.uuid
                });
            }
    
        });

    });

})
