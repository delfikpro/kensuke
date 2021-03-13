import * as Packets from '@/types/packets';

export function asError(error: Packets.Error) {
    return new Error(`Error ${error.errorLevel}: ${error.errorMessage}`);
}
