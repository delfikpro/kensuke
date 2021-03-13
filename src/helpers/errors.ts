import { Error } from '@/types/packets';

export function asError(error: Error) {
    return new Error(`Error ${error.errorLevel}: ${error.errorMessage}`);
}
