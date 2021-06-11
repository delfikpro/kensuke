import { MinecraftNode, Player, Session } from '@/classes';
import { Auth, CreateSession, UseScopes, Error, SyncData, RequestLeaderboard, EndSession, RequestSnapshot, LeaderboardEntry } from '@/types/packets';
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
    node.version = packet.version || 0;

    node.log('Node authorized as ' + account.id + ', protocol version is ' + node.version + ' ' + packet.version);

    return okResponse(`Successfully authorized as ${account.id}`);
}

export async function useScopes(node: MinecraftNode, packet: UseScopes) {
    const storage = getStorage();

    for (const scopeId of packet.scopes) {
        let scope = storage.getScope(scopeId);
        
        if (!scope) {
            scope = await storage.registerScope(scopeId, node.account);
        }

        if (node.scopes.includes(scope)) continue;

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
            node.log(`Player ${player.id} wasn't removed upon leaving the network. This is probably a bug.`, 'warn');
        } else {
            node.log(`Player ${player.id} connected to ${packet.realm}, asking ${oldSession.realm} to synchronize stats...`);

            const response = await oldSession.ownerNode.sendAndAwait(['requestSync', { session: oldSession.sessionId }]);

            // ToDo: Timeout errors probably shouldn't prevent logins
            if (response.type == 'error' && (response.data as Error).errorLevel != 'WARNING') {
                node.log(`${oldSession.realm} failed to save data for ${player.id}: ${(response.data as Error).errorMessage}`);
                throw asError(response.data as Error);
            }
        }
    } else {
        player = new Player(uuid);

        node.log(`Player ${player.id} joined the network on ${packet.realm}`);

        playerMap[uuid] = player;
    }

    const scopes: Scope[] = [];
    scopes.push(...node.scopes);

    if (packet.scopes) {
        for (let scopeId of packet.scopes) {

        let scope = getStorage().getScope(scopeId);

        if (!scope) {
            scope = await getStorage().registerScope(scopeId, node.account);
        }

        if (!node.account.allowedScopes.includes(scopeId)) {
            return errorResponse('FATAL', `Not enough permissions to use ${scopeId} scope`);
        }

        if (!scopes.includes(scope)) {
            scopes.push(scope);
        }
    
    }

    const newSession = new Session(player, packet.session, node, packet.realm, scopes);

    sessionMap[packet.session] = newSession;

    player.currentSession = newSession;

    const dataPacket: SyncData = {
        session: packet.session,
        stats: await player.getStats(scopes),
    };

    node.log(`Sending data of ${player.id} to ${newSession.realm}`);

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

    if (player.saveOwner && session.realm != player.saveOwner) {
        return errorResponse('WARNING', `Late save, player ${player.id} is already on ${realm}`);
    }

    player.saveOwner = session.realm;

    if (session.ownerNode != node) {
        node.log(`${node.account.id} tried to save data for ${player.id}, but the player is on ${realm}`);
        return errorResponse('WARNING', `Player ${player.id} is connected to ${realm}`);
    }

    // First we check access to all scopes
    for (const scope in packet.stats) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse('FATAL', `Account ${node.account.id} doesn't have enough permissions to alter '${scope}' scope`);
        }
        const actualScope = getStorage().getScope(scope);
        if (!actualScope) {
            return errorResponse('FATAL', `Tried to synchronize unknown scope '${scope}'`);
        }
        if (!session.lockedScopes.includes(actualScope)) {
            return errorResponse('FATAL', `Locked scopes of session ${session.sessionId} do not include the scope ${scope}`);
        }
    }

    // Then alter
    for (const scopeId in packet.stats) {
        const scope = getStorage().getScope(scopeId);

        const data = packet.stats[scopeId];

        player.stats[scopeId] = data;
        try {
            await storage.saveData(scope, player.id, data);
        } catch (error) {
            logger.error(`Error while saving ${player.id}:`, error);
            return errorResponse('SEVERE', 'Database error');
        }
    }

    node.log(`Realm ${session.realm} saved data for ${player.id}`);
    return okResponse(`Saved ${player.id}`);
}


export async function requestLeaderboard(node: MinecraftNode, packet: RequestLeaderboard) {
    const storage = getStorage();

    node.log(`Generating leaderboard for ${packet.scope} by ${packet.field} with the limit of ${packet.limit}`);

    const start = Date.now();

    
    let entries = await storage.getLeaderboard(storage.getScope(packet.scope), packet.field, packet.limit);
    if (node.version >= 1) {
        const ids: string[] = entries.map(e => e.id);
        if (packet.extraIds) ids.push(...packet.extraIds)
        
        const response: LeaderboardEntry[] = [];

        let i = 1;
        for (let entry of entries) {
            response.push({
                id: entry.id,
                position: i++,
                data: {
                    [packet.scope]: entry
                }
            });
        }

        if (packet.extraScopes) {
            for (let scopeId of packet.extraScopes) {
                let scope = storage.getScope(scopeId);
                if (!scope)
                    return errorResponse('FATAL', `Scope ${scopeId} doesn't exist`)
                if (!node.account.allowedScopes.includes(scopeId))
                    return errorResponse('FATAL', `Account ${node.account.id} doesn't have access to the scope ${scopeId}`)

                let batch = await storage.readDataBatch(scope, ids);
                
                for (let entry of response) {
                    entry.data[scopeId] = batch[entry.id];
                }
            }
        }
        entries = response;
    }

    const end = Date.now();

    node.log(`Leaderboard generation for ${packet.scope} by ${packet.field} and ${packet.extraScopes} took ${end - start} ms.`);

    console.log(entries);
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
        node.log(`${session.realm} closed the active session ${session.sessionId} of ${player.id}`);
        delete playerMap[player.id];
    } else {
        node.log(`${session.realm} closed an inactive session ${session.sessionId} of ${player.id}`);
    }

    return okResponse('Ok');
}

export async function requestSnapshot(node: MinecraftNode, packet: RequestSnapshot) {
    const scopes: Scope[] = [];

    node.log(`Requested data snapshot for ${packet.id} in ${packet.scopes.join(', ')}`);

    for (const scope of packet.scopes) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse('FATAL', `You don't have permission to request ${scope} scope`);
        }
        scopes.push(getStorage().getScope(scope));
    }

    const player = playerMap[packet.id] || new Player(packet.id);

    return ['snapshotData', { stats: player.getStats(scopes) }];
}
