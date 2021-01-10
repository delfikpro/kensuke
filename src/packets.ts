import { Stats } from './storage';

export type Frame = {

    type: string
    data: Packet
    realm?: string
    uuid?: string

}

export type Packet = {}

export type Ok = { message: string }

export type Error = {
    errorCode: number
    errorMessage: string
}

export type Auth = {
    login: string
    password: string
}

export type AddRealm = {
    realm: string
}

export type PlayerConnect = {
    uuid: string
    username: string
}

export type PlayerDisconnect = {
    uuid: string
}

export type PlayerSave = {
    uuid: string
    stats: Stats
}

export type PlayerData = {
    uuid: string
    previousRealm?: string
    stats: Stats
}


