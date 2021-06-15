import { MinecraftNode, Dao } from '@/classes';
import { Scope } from '@/types';

export class Session {
    public active = true;

    constructor(
        public readonly player: Dao,
        public readonly sessionId: string,
        public readonly ownerNode: MinecraftNode,
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
