import { Sendable } from '@/types';
import * as Packets from '@/types/packets';

export function okResponse(message: string): Sendable<Packets.Ok> {
    return ['ok', { message }];
}
export function errorResponse(
    errorLevel: Packets.ErrorLevel,
    errorMessage: string,
): Sendable<Packets.Error> {
    return ['error', { errorLevel, errorMessage }];
}
