import { MinecraftNode, Player } from '@/classes';
import { Scope } from '@/types';

export class Session {
    public active = true;

    constructor(
        public readonly player: Player,
        public readonly sessionId: string,
        public readonly ownerNode: MinecraftNode,
        public readonly realm: string,
        public readonly lockedScopes: Scope[]
    ) {}

    // public toLockState(): PlayerLockState {
    //     return {
    //         id: this.player.uuid,
    //         session: this.sessionId,
    //         realm: this.realm,
    //     };
    // }
}
