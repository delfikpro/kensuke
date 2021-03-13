import { MinecraftNode, Player } from '@/classes';
import { PlayerLockState } from '@/types';

export class Session {
    public active = true;

    constructor(
        public readonly player: Player,
        public readonly sessionId: string,
        public readonly ownerNode: MinecraftNode,
        public readonly realm: string,
    ) {}

    public toLockState(): PlayerLockState {
        return {
            id: this.player.uuid,
            session: this.sessionId,
            realm: this.realm,
        };
    }
}
