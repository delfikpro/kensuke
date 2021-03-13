import { MinecraftNode, Player, Session } from '@/classes';
import {
    Auth,
    CreateSession,
    UseScopes,
    Error,
    SyncData,
    RequestLeaderboard,
    EndSession,
} from '@/types/packets';
import {
    asError,
    errorResponse,
    getStorage,
    hashPassword,
    logger,
    okResponse,
    playerMap,
    sessionMap,
} from '@/helpers';

/*
Record<
    string,
    (node: MinecraftNode, packet: any) => Promise<Sendable<Record<any, any>>>
>
 */

export function auth(node: MinecraftNode, packet: Auth) {
    const storage = getStorage();

    if (node.account)
        return errorResponse(
            'WARNING',
            `Already authorized as ${node.account.id}.`,
        );

    const account = storage.getAccount(packet.login);

    if (!account || account.passwordHash !== hashPassword(packet.password))
        return errorResponse('FATAL', `Invalid credentials`);

    node.account = account;

    logger.info(`${account.id} authorized.`);

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
            return errorResponse(
                'FATAL',
                `Not enough permissions to use ${scopeId} scope`,
            );
        }

        node.scopes.push(scope);
    }

    return okResponse('All ok.');
}

export async function createSession(
    node: MinecraftNode,
    packet: CreateSession,
) {
    const existingSession = sessionMap[packet.session];
    if (existingSession) {
        logger.warn(
            `${packet.realm} tried to create an existing session: ${packet.session}`,
        );
        return errorResponse('SEVERE', 'Session already exists');
    }

    const uuid = packet.playerId;
    if (!uuid) return errorResponse('SEVERE', 'No playerId provided');

    let player = playerMap[uuid];

    if (player) {
        const oldSession = player.currentSession;

        if (!oldSession?.active) {
            logger.warn(
                `Player ${player.name} wasn't removed upon leaving the network. This is probably a bug.`,
            );
        } else {
            logger.info(
                `Player ${player.name} connected to ${packet.realm}, asking ${oldSession.realm} to synchronize stats...`,
            );

            const response = await oldSession.ownerNode.sendRequest([
                'requestSync',
                { session: oldSession.sessionId },
            ]);

            // ToDo: Timeout errors probably shouldn't prevent logins
            if (response.type == 'error') {
                logger.info(
                    `${oldSession.realm} failed to save data for ${
                        player.name
                    }: ${(response.data as Error).errorMessage}`,
                );
                throw asError(response.data as Error);
            }
        }
    } else {
        player = new Player(uuid, packet.username);

        logger.info(
            `Player ${player.name} joined the network on ${packet.realm}`,
        );

        playerMap[uuid] = player;
    }

    const newSession = new Session(player, packet.session, node, packet.realm);

    sessionMap[packet.session] = newSession;

    player.currentSession = newSession;

    const dataPacket: SyncData = {
        session: packet.session,
        stats: await player.getStats(node.scopes),
    };

    logger.info(`Sending data of ${player.name} to ${newSession.realm}`);

    return ['syncData', dataPacket];
}

export async function syncData(node: MinecraftNode, packet: SyncData) {
    const storage = getStorage();

    const sessionId = packet.session;
    const session = sessionMap[sessionId];

    if (!session) {
        logger.info(`Unable to find session ${sessionId}`);
        return errorResponse('SEVERE', `Unable to find session ${sessionId}`);
    }

    const player = session.player;
    const realm = session.realm;

    if (session.ownerNode != node) {
        logger.info(
            `${node.account.id} tried to save data for ${player.name}, but the player is on ${realm}`,
        );
        return errorResponse(
            'WARNING',
            `Player ${player.toString()} is connected to ${realm}`,
        );
    }

    // First we check access to all scopes
    for (const scope in packet.stats) {
        if (!node.account.allowedScopes.includes(scope)) {
            return errorResponse(
                'FATAL',
                `Account ${node.account.id} doesn't have enough permissions to alter '${scope}' scope`,
            );
        }
    }

    // Then alter
    for (const scopeId in packet.stats) {
        const scope = node.getScope(scopeId);
        if (!scope) {
            logger.warn(
                `${node.name} tried to save data for non-locked scope ${scopeId}`,
            );
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

    logger.info(`Realm ${session.realm} saved data for ${player.name}`);
    return okResponse(`Saved ${player.name}`);
}

export async function requestLeaderboard(
    node: MinecraftNode,
    packet: RequestLeaderboard,
) {
    const storage = getStorage();

    return [
        'leaderboardState',
        {
            entries: await storage.getLeaderboard(
                storage.getScope(packet.scope),
                packet.field,
                packet.limit,
            ),
        },
    ];
}

export async function endSession(node: MinecraftNode, packet: EndSession) {
    const sessionId = packet.session;

    const session = sessionMap[sessionId];

    if (!session) {
        logger.warn(
            `${node.toString()} tried to end a dead session ${sessionId}`,
        );
        return okResponse('Already dead');
    }

    const player = session.player;

    delete sessionMap[sessionId];

    if (player.currentSession == session) {
        logger.debug(
            `${session.realm} closed the active session ${session.sessionId} of ${player.name}`,
        );
        delete playerMap[player.uuid];
    } else {
        logger.debug(
            `${session.realm} closed an inactive session ${session.sessionId} of ${player.name}`,
        );
    }

    return okResponse('Ok');
}
