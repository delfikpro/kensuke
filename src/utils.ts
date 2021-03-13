import { createHash } from 'crypto';

export function hashPassword(password: string): string {
    return createHash('sha1').update(password).digest('hex');
}
