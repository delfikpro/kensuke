import { dataStorage, MinecraftNode, Dao, Session } from '@/classes';
import { Auth, CreateSession, UseScopes, Error, SyncData, RequestLeaderboard, EndSession, RequestSnapshot, LeaderboardEntry, RequestSync } from '@/types/packets';
import { KensukeData, Scope } from '@/types/types';
import { asError, errorResponse, hashPassword, logger, okResponse } from '@/helpers';
import { nodes } from './connection';
import { sessionStorage, StoredSession } from '@/session/session-storage';
import { getDao } from '@/data/data-cache';

/*
Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
>
 */

export function auth(node: MinecraftNode, packet: Auth) {

    if (node.account) return errorResponse('WARNING', `Already authorized as ${node.account.id}.`);

    const account = dataStorage.getAccount(packet.login);

    if (!account || account.passwordHash !== hashPassword(packet.password)) return errorResponse('FATAL', `Invalid credentials`);

    node.account = account;
    node.nodeName = packet.nodeName;
    node.version = packet.version || 0;

    node.log('Node authorized as ' + account.id + ', protocol version is ' + node.version + ' ' + packet.version);

    if (node.version == 0) {
        setInterval(() => {
            sessionStorage.sessionMap.forEach(session => {
                if (session.node == node.nodeName && session.account == node.account.id) {
                    node.send(['requestSync', { session: session.sessionId } as RequestSync])
                }
            })
        }, 500);
    } else if (node.version > 0 && packet.activeSessions) {
        for (let sessionId of packet.activeSessions) {
            let session = sessionStorage.getSession(sessionId);
            if (!session) {
                node.log('Ignored unknown session on handshake: ' + sessionId);
                continue;
            }
            if (session.account != node.account.id || session.node != node.nodeName) {
                node.log(`Ignored session ${sessionId} because owner differs: ${session.node}/${session.account}`)
                continue;
            }
            node.ownedSessions.push(sessionId);
            node.log(`Now owning session ${sessionId} of ${session.dataId}`);
        }
    }

    return okResponse(`Successfully authorized as ${account.id}`);
}

export async function useScopes(node: MinecraftNode, packet: UseScopes) {

    for (const scopeId of packet.scopes) {
        let scope = dataStorage.getScope(scopeId);
        
        if (!scope) {
            scope = await dataStorage.registerScope(scopeId, node.account);
        }

        if (node.scopes.includes(scope)) continue;

        if (!node.hasAccessTo(scopeId)) {
            return errorResponse('FATAL', `Not enough permissions to use ${scopeId} scope`);
        }

        node.scopes.push(scope);
    }

    return okResponse('All ok.');
}

export async function createSession(node: MinecraftNode, packet: CreateSession) {

    if (sessionStorage.getSession(packet.session)) {
        logger.warn(`${node} tried to create an existing session: ${packet.session}`);
        return errorResponse('SEVERE', 'Session already exists');
    }

    const dataId = packet.playerId;
    if (!dataId) return errorResponse('SEVERE', 'No playerId provided');

    const sessions = sessionStorage.getSessionsByDataId(dataId);

    if (sessions.length) {
        
        const oldSession = sessions[0];

        const oldSessionNode = nodes.find(s => s.ownedSessions.includes(oldSession.sessionId));

        if (!oldSessionNode) {

            let firstFailTime = oldSession.firstFailTime;
            if (!firstFailTime) {
                oldSession.firstFailTime = firstFailTime = Date.now();
            }

            const sessionLifetime = Date.now() - firstFailTime;
            if (sessionLifetime > 60000) {
                await sessionStorage.removeSession(oldSession.sessionId);
                node.log(`Discarded old session ${oldSession.sessionId} of ${oldSession.dataId} because its previous owner ${oldSession.node}/${oldSession.account} never reconnected`, 'warn')
            } else {
                return errorResponse('TIMEOUT', `Node ${oldSession.node} was using the data of ${dataId} and is now unreachable. Old session will be discarded in ${60000 - sessionLifetime} ms.`);
            }
        }

        node.log(`Created session ${packet.session} for ${dataId}, asking ${oldSessionNode} to synchronize data...`);

        if (oldSessionNode) {
            
            const response = await oldSessionNode.sendAndAwait(['requestSync', { session: oldSession.sessionId }]);
    
            if (response.type == 'error') {

                let firstFailTime = oldSession.firstFailTime;
                if (!firstFailTime) {
                    oldSession.firstFailTime = firstFailTime = Date.now();
                }

                const sessionLifetime = Date.now() - firstFailTime;

                const error = response.data as Error;
                oldSessionNode.log(`Error while force syncing session ${oldSession.sessionId} of ${oldSession.dataId}: ${error.errorMessage}`);

                if (sessionLifetime > 60000) {
                    await sessionStorage.removeSession(oldSession.sessionId);
                    node.log(`Discarding old session ${oldSession.sessionId} of ${oldSession.dataId} because its previous owner ${oldSession.node}/${oldSession.account} was unable to save the data in 60 seconds`, 'warn')
                    node.send(['endSession', { session: oldSession.sessionId } as EndSession])
                } else {
                    return errorResponse('TIMEOUT', `Node ${oldSession.node} was using the data of ${dataId} and is now unreachable. Old session will be discarded in ${60000 - sessionLifetime} ms.`);
                }
            }
        }

        if (sessions.length > 1)
            return errorResponse('SEVERE', `Id ${dataId} already has multiple sessions: ${sessions.map(s => s.sessionId).join(", ")}`);
    
    }

    const scopes: Scope[] = [];
    scopes.push(...node.scopes);

    if (packet.scopes) {
        for (let scopeId of packet.scopes) {

            let scope = dataStorage.getScope(scopeId);

            if (!scope) {
                scope = await dataStorage.registerScope(scopeId, node.account);
            }

            if (!node.hasAccessTo(scopeId)) {
                return errorResponse('FATAL', `Not enough permissions to use ${scopeId} scope`);
            }

            if (!scopes.includes(scope)) {
                scopes.push(scope);
            }
        }
    
    }

    const dataPacket: SyncData = {
        session: packet.session,
        stats: await getDao(dataId).getData(scopes),
    };

    // Old kensuke clients are hoping that scopes are prefixed with "players:"
    if (node.version < 1) {
        const statsOld: KensukeData = {};
        for (let scope in dataPacket.stats) {
            statsOld["players:" + scope.replace("players:", "")] = dataPacket.stats[scope];
        }
        dataPacket.stats = statsOld;
    }

    // After all the data is ready, create the session.
    const newSession: StoredSession = {
        dataId,
        account: node.account.id,
        node: node.nodeName,
        scopes: packet.scopes,
        sessionId: packet.session,
        time: Date.now(),
        hadWrites: false,
        firstFailTime: 0
    };

    // Write session to session database
    await sessionStorage.writeSession(newSession);

    // And also to owned sessions of this node
    node.ownedSessions.push(newSession.sessionId);

    node.log(`Locked ${dataId} with session ${newSession.sessionId} and scopes ${packet.scopes?.join(",")}`);

    return ['syncData', dataPacket];
}

export async function syncData(node: MinecraftNode, packet: SyncData) {
    const storage = dataStorage;

    const sessionId = packet.session;

    const session = sessionStorage.getSession(sessionId);

    if (!session) {
        node.log(`Unable to find session ${sessionId} for sync`, 'error');

        node.send(['endSession', {session: sessionId} as EndSession]);
        return errorResponse('SEVERE', `Unable to find session ${sessionId}`);
    }

    const sessionOwnerNode = nodes.find(node => node.ownedSessions.includes(sessionId));

    // If no other node has claimed this session before, allow this node to become its owner.
    if (!sessionOwnerNode && session.account == node.account.id) {
        node.ownedSessions.push(sessionId);
    } else if (sessionOwnerNode != node) {
        node.log(`Tried to sync on ${sessionId} of ${session.dataId}, but ${session.account} at ${sessionOwnerNode} is the owner.`)
        return errorResponse('SEVERE', `This session is owned by ${session.account} at ${sessionOwnerNode}`);
    }


    // If there is a newer session than this, that already saved some data,
    // then old session syncs will be ignored.
    const saveOwnerSession = sessionStorage.getLatestSessionWithWrites(session.sessionId);

    if (saveOwnerSession && saveOwnerSession != session) {
        node.log(`Received syncData for an active session ${sessionId} of ${session.dataId}, but there already is \
                 an another active session ${saveOwnerSession.sessionId} on ${saveOwnerSession.node}`, 'warn');
        return errorResponse('WARNING', `Ignored the save for session ${sessionId} of ${session.dataId} because there \
                is a newer active session ${saveOwnerSession.sessionId}`)
    }

    // Now this is the newest session with writes
    session.hadWrites = true;
    await sessionStorage.writeSession(session);

    // Forget about previous fails
    session.firstFailTime = 0;

    // First we check access to all the scopes
    for (const scope in packet.stats) {
        if (!node.hasAccessTo(scope)) {
            return errorResponse('FATAL', `Account ${node.account.id} doesn't have enough permissions to alter the '${scope}' scope`);
        }
        const actualScope = dataStorage.getScope(scope);
        if (!actualScope) {
            return errorResponse('FATAL', `Tried to synchronize unknown scope '${scope}'`);
        }
        if (!session.scopes.includes(actualScope.id)) {
            return errorResponse('FATAL', `Locked scopes of session ${session.sessionId} do not include the scope ${scope}`);
        }
    }

    let dao = getDao(session.dataId);

    // Then alter
    for (const scopeId in packet.stats) {
        const scope = dataStorage.getScope(scopeId);

        const data = packet.stats[scopeId];

        dao.stats[scopeId] = data;
        try {
            await storage.saveData(scope, dao.id, data);
        } catch (error) {
            logger.error(`Error while saving ${dao.id}:`, error);
            return errorResponse('SEVERE', 'Database error');
        }
    }

    node.log(`Saved data for session ${sessionId} of ${session.dataId}`);
    return okResponse(`Saved ${session.dataId}`);
}


export async function requestLeaderboard(node: MinecraftNode, packet: RequestLeaderboard) {

    node.log(`Generating leaderboard for ${packet.scope} by ${packet.field} with the limit of ${packet.limit}`);

    const start = Date.now();

    
    let entries = await dataStorage.getLeaderboard(dataStorage.getScope(packet.scope), packet.field, packet.limit);
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
                let scope = dataStorage.getScope(scopeId);
                if (!scope)
                    return errorResponse('FATAL', `Scope ${scopeId} doesn't exist`)
                if (!node.hasAccessTo(scopeId))
                    return errorResponse('FATAL', `Account ${node.account.id} doesn't have access to the scope ${scopeId}`)

                let batch = await dataStorage.readDataBatch(scope, ids);
                
                for (let entry of response) {
                    entry.data[scopeId] = batch[entry.id];
                }
            }
        }
        entries = response;
    }

    const end = Date.now();

    node.log(`Leaderboard generation for ${packet.scope} by ${packet.field} and ${packet.extraScopes} took ${end - start} ms.`);

    // console.log(entries);
    return ['leaderboardState', { entries }];
}

export async function endSession(node: MinecraftNode, packet: EndSession) {
    const sessionId = packet.session;

    const session = sessionStorage.getSession(sessionId);

    if (!session) {
        node.log(`Tried to end a dead session ${sessionId}`);
        return okResponse('Already dead');
    }
    
    const sessionOwnerNode = nodes.find(node => node.ownedSessions.includes(sessionId));

    // If no other node has claimed this session before, allow this node to become its owner.
    if (sessionOwnerNode && sessionOwnerNode != node) {
        node.log(`Tried to end session ${sessionId} that belongs to ${sessionOwnerNode}`, 'warning');
        return errorResponse("SEVERE", `Session ${sessionId} is owned by a different node.`);
    }

    // Remove session from the database
    await sessionStorage.removeSession(session.sessionId);

    // Also remove it from ownedSessions of this node
    node.ownedSessions.splice(node.ownedSessions.indexOf(sessionId), 1);

    node.log(`Ended session ${session.sessionId} of ${session.dataId}.`);

    return okResponse('Ok');
}

export async function requestSnapshot(node: MinecraftNode, packet: RequestSnapshot) {
    const scopes: Scope[] = [];

    node.log(`Requested data snapshot for ${packet.id} in ${packet.scopes.join(', ')}`);

    for (const scope of packet.scopes) {
        if (!node.hasAccessTo(scope)) {
            return errorResponse('FATAL', `You don't have permission to request ${scope} scope`);
        }
        scopes.push(dataStorage.getScope(scope));
    }

    return ['snapshotData', { stats: await getDao(packet.id).getData(scopes) }];
}
