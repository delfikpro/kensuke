import { MinecraftNode, Realm, Sendable } from "./network";
import { Stats, StatStorage, StatStorageImpl } from "./storage";
import * as Packets from './packets'
import { Account, authorize } from "./authorization";
import * as winston from 'winston';

// winston.addColors({
//     info: 'blue',
//     warning: 'yellow',
//     error: 'red'

// })

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

class Player {

    currentRealm: Realm;
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

let allPlayers: Record<string, Player> = {};

let requiredVariables = ["MONGO_URL", "MONGO_USER", "MONGO_PASSWORD"];
for (let variable of requiredVariables) {
    if (!process.env[variable]) throw Error('No MONGO_URL environment variable specified.')
}

let env = process.env;
let storage: StatStorage = new StatStorageImpl(env.MONGO_URL, env.MONGO_USER, env.MONGO_PASSWORD);


export function okResponse(message: string): Sendable<Packets.Ok> {
    return ['ok', { message }]
}

export function errorResponse(errorCode: number, errorMessage: string): Sendable<Packets.Error> {
    return ['error', { errorCode, errorMessage }]
}

export function asError(error: Packets.Error) {
    return new Error(`Error ${error.errorCode}: ${error.errorMessage}`);
}

export const handlerMap: Record<string, (node: MinecraftNode, realm: Realm, packet: any) => Promise<Sendable<object>>> = {};

handlerMap.auth = async (node, _realm, packet: Packets.Auth) => {

    if (node.account)
        return errorResponse(101, `Already authorized as ${node.account.login}.`)

    let account = authorize(packet.login, packet.password);

    if (!account)
        return errorResponse(102, `Invalid credentials`);

    node.account = account;
    return okResponse(`Successfully authorized as ${account.login}`);

};


handlerMap.addRealm = async (node, realm, packet: Packets.AddRealm) => {
    node.realms[packet.realm] = new Realm(packet.realm, node);
    return okResponse(`Successfully added realm ${packet.realm}`);
}

handlerMap.playerConnect = async (node, newRealm, packet: Packets.PlayerConnect) => {

    let uuid = packet.uuid;

    var player = allPlayers[uuid];

    if (player) {
        let oldRealm = player.currentRealm;

        if (oldRealm != newRealm) {

            let response = await oldRealm.sendRequest(['playerDisconnect', { uuid }]);

            // ToDo: Timeout errors probably shouldn't prevent logins
            if (response.type == 'error')
                throw asError(response.data as Packets.Error);

        }

        let packet: Packets.PlayerData = {
            uuid,
            previousRealm: oldRealm.name,
            stats: player.filterStats(node.account.allowedScopes)
        };

        return ['playerData', packet];

    } else {
        player = new Player(uuid, packet.username);
        player.stats = await storage.provideStats(uuid);
        allPlayers[uuid] = player;
        player.currentRealm = newRealm;

        let dataPacket: Packets.PlayerData = {
            uuid,
            stats: player.filterStats(node.account.allowedScopes)
        };

        return ['playerData', dataPacket];
    }
}

handlerMap.playerSave = async (node, realm, packet: Packets.PlayerSave) => {

    let uuid = packet.uuid;
    let player = allPlayers[uuid];

    if (!player) {
        return errorResponse(201, 'Tried to save stats for an offline player ' + uuid)
    }

    if (player.currentRealm != realm) {
        return errorResponse(202, `Player ${player.toString()} is connected to ${player.currentRealm.name}, rejected save from ${realm.name}`)
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

    storage.saveStats(player.uuid, player.stats);

}

handlerMap.playerDisconnect = async (node, realm, packet: Packets.PlayerDisconnect) => {

    let uuid = packet.uuid;
    let player = allPlayers[uuid];
    if (player) {
        if (player.currentRealm == realm) {
            delete allPlayers[uuid];
        }
    }

    return null;

}