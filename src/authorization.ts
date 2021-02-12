
import { createHash } from 'crypto';

export type Account = {
    login: string,
    allowedScopes: string[],
    passwordHash: string
};

let accounts: Record<string, Account> = {};

accounts.delfikpro = {
    login: 'delfikpro',
    allowedScopes: ['somegame', 'dungeons'],
    passwordHash: hashPassword('12345')
}

function hashPassword(password: string): string {
    return createHash('sha1').update(password).digest('hex')
}

export function authorize(login: string, password: string): Account | undefined {

    let account = accounts[login];
    if (!account) return undefined;

    if (account.passwordHash !== hashPassword(password)) return undefined;

    return account;

}



