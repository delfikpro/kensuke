import { MinecraftNode, Player, Session } from '@/classes';
import { Auth, CreateSession, UseScopes, Error, SyncData, RequestLeaderboard, EndSession, RequestSnapshot } from '@/types/packets';
import { Scope } from '@/types/types';
import { asError, errorResponse, getStorage, hashPassword, logger, okResponse, playerMap, sessionMap } from '@/helpers';

/*
Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
>
 */

export function auth(node: MinecraftNode, packet: Auth) {
    const storage = getStorage();

    if (node.account) return errorResponse('WARNING', `Already authorized as ${node.account.id}.`);

    const account = storage.getAccount(packet.login);

    if (!account || account.passwordHash !== hashPassword(packet.password)) return errorResponse('FATAL', `Invalid credentials`);

    node.account = account;
    node.nodeName = packet.nodeName;

    node.log('Node authorized as ' + account.id);

    return okResponse(`Successfully authorized as ${account.id}`);
}

export async function useScopes(node: MinecraftNode, packet: UseScopes) {
    const storage = getStorage();

    for (const scopeId of packet.scopes) {
        if (node.getScope(scopeId)) continue;

        let scope = storage.getScope(scopeId);
        if (!scope) {
            scope = await storage.registerScope(scopeId, node.account);
        }

        if (!node.account.allowedScopes.includes(scopeId)) {
            return errorResponse('FATAL', `Not enough permissions to use ${scopeId} scope`);
        }

        node.scopes.push(scope);
    }

    return okResponse('All ok.');
}

export async function createSession(node: MinecraftNode, packet: CreateSession) {
    const existingSession = sessionMap[packet.session];
    if (existingSession) {
        logger.warn(`${packet.realm} tried to create an existing session: ${packet.session}`);
        return errorResponse('SEVERE', 'Session already exists');
    }

    const uuid = packet.playerId;
    if (!uuid) return errorResponse('SEVERE', 'No playerId provided');

    let player = playerMap[uuid];

    if (player) {
        const oldSession = player.currentSession;

        if (!oldSession?.active) {
            node.log(`Player ${player.name} wasn't removed upon leaving the network. This is probably a bug.`, 'warn');
        } else {
            node.log(`Player ${player.name} connected to ${packet.realm}, asking ${oldSession.realm} to synchronize stats...`);

            const response = await oldSession.ownerNode.sendRequest(['requestSync', { session: oldSession.sessionId }]);

            // ToDo: Timeout errors probably shouldn't prevent logins
            if (response.type == 'error' && (response.data as Error).errorLevel != 'WARNING') {
                node.log(`${oldSession.realm} failed to save data for ${player.name}: ${(response.data as Error).errorMessage}`);
                throw asError(response.data as Error);
            }
        }
    } else {
        player = new Player(uuid, packet.username);

        node.log(`Player ${player.name} joined the network on ${packet.realm}`);

        playerMap[uuid] = player;
    }

    const newSession = new Session(player, packet.session, node, packet.realm);

    sessionMap[packet.session] = newSession;

    player.currentSession = newSession;

    const dataPacket: SyncData = {
        session: packet.session,
        stats: await player.getStats(node.scopes),
    };

    node.log(`Sending data of ${player.name} to ${newSession.realm}`);

    return ['syncData', dataPacket];
}

export async function syncData(node: MinecraftNode, packet: SyncData) {
    const storage = getStorage();

    const sessionId = packet.session;
    const session = sessionMap[sessionId];

    if (!session) {
        node.log(`Unable to find session ${sessionId}`);
        return errorResponse('SEVERE', `Unable to find session ${sessionId}`);
    }

    const player = session.player;
    const realm = session.realm;

    if (session.ownerNode != node) {
        node.log(`${node.account.id} tried to save data for ${player.name}, but the player is on ${realm}`);
        return errorResponse('WARNING', `Player ${player.toString()} is connected to ${realm}`);
    }

    // First we check access to all scopes
    for (const scope in packet.stats) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse('FATAL', `Account ${node.account.id} doesn't have enough permissions to alter '${scope}' scope`);
        }
    }

    // Then alter
    for (const scopeId in packet.stats) {
        const scope = node.getScope(scopeId);
        if (!scope) {
            node.log(`${node.name} tried to save data for non-locked scope ${scopeId}`, 'warining');
            continue;
        }

        const data = packet.stats[scopeId];

        player.stats[scopeId] = data;
        try {
            await storage.saveData(scope, player.uuid, data);
        } catch (error) {
            logger.error(`Error while saving ${player.name}:`, error);
            return errorResponse('SEVERE', 'Database error');
        }
    }

    node.log(`Realm ${session.realm} saved data for ${player.name}`);
    return okResponse(`Saved ${player.name}`);
}

export async function requestLeaderboard(node: MinecraftNode, packet: RequestLeaderboard) {
    const storage = getStorage();

    node.log(`Generating leaderboard for ${packet.scope} with the limit of ${packet.limit}`);

    const start = performance.now();

    const entries = await storage.getLeaderboard(storage.getScope(packet.scope), packet.field, packet.limit);

    const end = performance.now();

    node.log(`Leaderboard generation for ${packet.scope} took ${end - start} ms.`);

    return ['leaderboardState', { entries }];
}

export async function endSession(node: MinecraftNode, packet: EndSession) {
    const sessionId = packet.session;

    const session = sessionMap[sessionId];

    if (!session) {
        node.log(`Tried to end a dead session ${sessionId}`, 'warn');
        return okResponse('Already dead');
    }

    const player = session.player;

    delete sessionMap[sessionId];

    if (player.currentSession == session) {
        node.log(`${session.realm} closed the active session ${session.sessionId} of ${player.name}`);
        delete playerMap[player.uuid];
    } else {
        node.log(`${session.realm} closed an inactive session ${session.sessionId} of ${player.name}`);
    }

    return okResponse('Ok');
}

export async function requestSnapshot(node: MinecraftNode, packet: RequestSnapshot) {
    const scopes: Scope[] = [];

    node.log(`Requested data snapshot for ${packet.id} in \
            ${packet.scopes.join(', ')}`);

    for (const scope of packet.scopes) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse('FATAL', `You don't have permission to request ${scope} scope`);
        }
        scopes.push(node.getScope(scope));
    }

    const player = playerMap[packet.id] || new Player(packet.id, packet.id);

    return ['snapshotData', { stats: player.getStats(scopes) }];
}
