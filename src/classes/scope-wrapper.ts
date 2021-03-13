import { Collection } from 'mongodb';
import { Scope } from '@/types/types';

export class ScopeWrapper {
    constructor(public scope: Scope, public collection: Collection<any>) {}
}
