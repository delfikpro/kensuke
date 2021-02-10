import { Stats } from './storage';

export type UUID = string

export type Frame = {

    type: string
    data: Packet
    uuid?: UUID

}

export type Packet = {}

export type Ok = { message: string }

export type Error = {
    errorCode: number
    errorMessage: string
}

/**
 * Auth packet is the first packet sent by statservice clients
 */
export type Auth = {
    login: string
    password: string
    nodeName: string
}

/**
 * When a player attempts to join a realm, a session is created.
 * Session id is used to synchronize the data between statservice and minecraft servers
 */
export type CreateSession = {
    playerId: UUID
    session: UUID
    username: string
    realm: string
}

/**
 * When a player disconnects from a realm, the session is removed.
 * When the player has no sessions, the player is considered to be offline.
 */
export type EndSession = {
    session: UUID
}

/**
 * Minecraft servers write the modified stats into statservice using this packet.
 * They can send data whenever they want, the only requirement is owning the active session.
 * 
 * When a player joins a minecraft server, statservice also sends the stats using this packet.
 */
export type SyncData = {
    session: UUID
    stats: Stats
}

/**
 * Statservice will request data synchronization when player jumps from one realm to another.
 * It will do so using this packet.
 */
export type RequestSync = {
    session: UUID
}
