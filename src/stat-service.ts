import { MinecraftNode, Sendable } from "./network";
import { Stats } from "./storage";
import * as Packets from './packets'
import { Account, authorize } from "./authorization";
import { logger, storage } from ".";

export class Session {

    public active: boolean = true

    constructor(
        public readonly player: Player,
        public readonly sessionId: string,
        public readonly ownerNode: MinecraftNode,
        public readonly realm: string,
    ) { }
}

export class Player {

    currentSession: Session;
    stats: Stats;

    constructor(
        public readonly uuid: string,
        public name: string
    ) { }

    filterStats(scopes: string[]) {
        let stats: Stats = {};
        for (let scope of scopes) {
            stats[scope] = this.stats[scope];
        }
        return stats;
    }

    toString(): string {
        return `${this.name} (${this.uuid})`;
    }

}

export const playerMap: Record<Packets.UUID, Player> = {};
export const sessionMap: Record<Packets.UUID, Session> = {};

export function okResponse(message: string): Sendable<Packets.Ok> {
    return ['ok', { message }]
}

export function errorResponse(errorCode: number, errorMessage: string): Sendable<Packets.Error> {
    return ['error', { errorCode, errorMessage }]
}

export function asError(error: Packets.Error) {
    return new Error(`Error ${error.errorCode}: ${error.errorMessage}`);
}

export const handlerMap: Record<string, (node: MinecraftNode, packet: any) => Promise<Sendable<object>>> = {};

handlerMap.auth = async (node, packet: Packets.Auth) => {

    if (node.account)
        return errorResponse(101, `Already authorized as ${node.account.login}.`)

    let account = authorize(packet.login, packet.password);

    if (!account)
        return errorResponse(102, `Invalid credentials`);

    node.account = account;

    logger.info(`${account.login} authorized.`)

    return okResponse(`Successfully authorized as ${account.login}`);

};



handlerMap.createSession = async (node, packet: Packets.CreateSession) => {

    let existingSession = sessionMap[packet.session];
    if (existingSession) {
        logger.warn(`${packet.realm} tried to create an existing session: ${packet.session}`);
        return errorResponse(103, 'Session already exists')
    }

    let uuid = packet.playerId;
    if (!uuid) return errorResponse(104, 'No playerId provided')

    var player = playerMap[uuid];

    if (player) {
        let oldSession = player.currentSession;

        if (!oldSession?.active) {
            logger.warn(`Player ${player.name} wasn't removed upon leaving the network. This is probably a bug.`)
        } else {

            logger.info(`Player ${player.name} connected to ${packet.realm}, asking ${oldSession.realm} to synchronize stats...`)

            let response = await oldSession.ownerNode.sendRequest(['requestSync', { session: oldSession.sessionId }]);

            // ToDo: Timeout errors probably shouldn't prevent logins
            if (response.type == 'error') {
                logger.info(`${oldSession.realm} failed to save data for ${player.name}: ${(response.data as Packets.Error).errorMessage}`)
                throw asError(response.data as Packets.Error);
            }

        }

    } else {
        player = new Player(uuid, packet.username);

        logger.info(`Player ${player.name} joined the network on ${packet.realm}`)

        player.stats = await storage.provideStats(uuid);
        playerMap[uuid] = player;

    }

    let newSession = new Session(player, packet.session, node, packet.realm);

    sessionMap[packet.session] = newSession

    player.currentSession = newSession;

    let dataPacket: Packets.SyncData = {
        session: packet.session,
        stats: player.filterStats(node.account.allowedScopes)
    };

    logger.info(`Sending data of ${player.name} to ${newSession.realm}`)

    return ['syncData', dataPacket];
}

handlerMap.syncData = async (node, packet: Packets.SyncData) => {

    let sessionId = packet.session;

    let session = sessionMap[sessionId];

    if (!session) {
        logger.info(`Unable to find session ${sessionId}`)
        return errorResponse(201, `Unable to find session ${sessionId}`)
    }

    let player = session.player
    let realm = session.realm

    if (session.ownerNode != node) {
        logger.info(`${node.account.login} tried to save data for ${player.name}, but the player is on ${realm}`)
        return errorResponse(202, `Player ${player.toString()} is connected to ${realm}`)
    }


    // First we check access to all scopes
    for (let scope in packet.stats) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse(203, `Account ${node.account.login} doesn't have enough permissions to alter '${scope}' scope`)
        }
    }

    // Then alter
    for (let scope in packet.stats) {
        player.stats[scope] = packet.stats[scope];
    }

    try {
        await storage.saveStats(player.uuid, player.stats);
        logger.info(`Realm ${session.realm} saved data for ${player.name}`);
        return okResponse(`Saved ${player.name}`);
    } catch (error) {
        logger.error(`Error while saving ${player.name}:`, error)
        return errorResponse(204, 'Database error')
    }


}

handlerMap.endSession = async (node, packet: Packets.EndSession) => {

    let sessionId = packet.session;

    let session = sessionMap[sessionId];

    if (!session) {
        logger.warn(`${node.toString()} tried to end a dead session ${sessionId}`)
        return okResponse('Already dead')
    }

    let player = session.player;
    
    delete sessionMap[sessionId]
    
    if (player.currentSession == session) {
        logger.debug(`${session.realm} closed the active session ${session.sessionId} of ${player.name}`)
        delete playerMap[player.uuid]
    } else {
        logger.debug(`${session.realm} closed an inactive session ${session.sessionId} of ${player.name}`)
    }

    return okResponse('Ok')

}