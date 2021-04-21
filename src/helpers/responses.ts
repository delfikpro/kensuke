import { Sendable, Ok, Error, ErrorLevel } from '@/types';

export function okResponse(message: string): Sendable<Ok> {
    return ['ok', { message }];
}
export function errorResponse(errorLevel: ErrorLevel, errorMessage: string): Sendable<Error> {
    return ['error', { errorLevel, errorMessage }];
}
