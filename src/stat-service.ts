import { MinecraftNode, Sendable } from "./network";
import { PlayerLockState, Scope, Stats } from "./storage";
import * as Packets from './packets'
import { logger, storage } from ".";
import { hashPassword } from "./authorization";
import { access } from "fs";

export class Session {

    public active: boolean = true

    constructor(
        public readonly player: Player,
        public readonly sessionId: string,
        public readonly ownerNode: MinecraftNode,
        public readonly realm: string,
    ) { }

    public toLockState(): PlayerLockState {
        return {
            id: this.player.uuid,
            session: this.sessionId,
            realm: this.realm
        }
    }

}

export class Player {

    currentSession: Session;
    stats: Stats = {};

    constructor(
        public readonly uuid: string,
        public name: string
    ) { }

    async getStats(scopes: Scope[]): Promise<Stats> {
        let stats: Stats = {};
        for (let scope of scopes) {
            let s = this.stats[scope.id];
            if (!s) {
                s = await storage.readData(scope, this.uuid);
                this.stats[scope.id] = s;
            }
            stats[scope.id] = s
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

export function errorResponse(errorLevel: Packets.ErrorLevel, errorMessage: string): Sendable<Packets.Error> {
    return ['error', { errorLevel, errorMessage }]
}

export function asError(error: Packets.Error) {
    return new Error(`Error ${error.errorLevel}: ${error.errorMessage}`);
}

export const handlerMap: Record<string, (node: MinecraftNode, packet: any) => Promise<Sendable<object>>> = {};

handlerMap.auth = async (node, packet: Packets.Auth) => {

    if (node.account)
        return errorResponse('WARNING', `Already authorized as ${node.account.id}.`)

    let account = storage.getAccount(packet.login);

    if (!account || account.passwordHash !== hashPassword(packet.password))
        return errorResponse('FATAL', `Invalid credentials`);

    node.account = account;

    logger.info(`${account.id} authorized.`)

    return okResponse(`Successfully authorized as ${account.id}`);

};

handlerMap.useScopes = async (node, packet: Packets.UseScopes) => {

    for (let scopeId of packet.scopes) {

        if (node.getScope(scopeId)) continue

        let scope = storage.getScope(scopeId)
        if (!scope) {
            scope = await storage.registerScope(scopeId, node.account)
        }

        if (!node.account.allowedScopes.includes(scopeId)) {
            return errorResponse('FATAL', `Not enough permissions to use ${scopeId} scope`)
        }

        node.scopes.push(scope)
    }

    return okResponse("All ok.")

}

handlerMap.createSession = async (node, packet: Packets.CreateSession) => {

    let existingSession = sessionMap[packet.session];
    if (existingSession) {
        logger.warn(`${packet.realm} tried to create an existing session: ${packet.session}`);
        return errorResponse('SEVERE', 'Session already exists')
    }

    let uuid = packet.playerId;
    if (!uuid) return errorResponse('SEVERE', 'No playerId provided')

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

        playerMap[uuid] = player;

    }

    let newSession = new Session(player, packet.session, node, packet.realm);

    sessionMap[packet.session] = newSession

    player.currentSession = newSession;

    let dataPacket: Packets.SyncData = {
        session: packet.session,
        stats: await player.getStats(node.scopes)
    };

    logger.info(`Sending data of ${player.name} to ${newSession.realm}`)

    return ['syncData', dataPacket];
}

handlerMap.syncData = async (node, packet: Packets.SyncData) => {

    let sessionId = packet.session;

    let session = sessionMap[sessionId];

    if (!session) {
        logger.info(`Unable to find session ${sessionId}`)
        return errorResponse('SEVERE', `Unable to find session ${sessionId}`)
    }

    let player = session.player
    let realm = session.realm

    if (session.ownerNode != node) {
        logger.info(`${node.account.id} tried to save data for ${player.name}, but the player is on ${realm}`)
        return errorResponse('WARNING', `Player ${player.toString()} is connected to ${realm}`)
    }


    // First we check access to all scopes
    for (let scope in packet.stats) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse('FATAL', `Account ${node.account.id} doesn't have enough permissions to alter '${scope}' scope`)
        }
    }

    // Then alter
    for (let scopeId in packet.stats) {
        let scope = node.getScope(scopeId);
        if (!scope) {
            logger.warn(`${node.name} tried to save data for non-locked scope ${scopeId}`)
            continue;
        }

        let data = packet.stats[scopeId];

        player.stats[scopeId] = data;
        try {
            await storage.saveData(scope, player.uuid, data)
        } catch (error) {
            logger.error(`Error while saving ${player.name}:`, error)
            return errorResponse('SEVERE', 'Database error')
        }
    }

    logger.info(`Realm ${session.realm} saved data for ${player.name}`);
    return okResponse(`Saved ${player.name}`);


}

handlerMap.requestLeaderboard = async (node, packet: Packets.RequestLeaderboard) => {
    return ['leaderboardState', await storage.getLeaderboard(storage.getScope(packet.scope), packet.field, packet.limit)]
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