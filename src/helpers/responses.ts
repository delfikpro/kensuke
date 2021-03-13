import { Sendable } from '@/types';
import { Ok, Error, ErrorLevel } from '@/types/packets';

export function okResponse(message: string): Sendable<Ok> {
    return ['ok', { message }];
}
export function errorResponse(
    errorLevel: ErrorLevel,
    errorMessage: string,
): Sendable<Error> {
    return ['error', { errorLevel, errorMessage }];
}
