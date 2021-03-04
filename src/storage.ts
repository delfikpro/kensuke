import { access } from 'fs';
import * as mongodb from 'mongodb';
import { logger } from '.';
import { hashPassword } from './authorization'

export type Stats = Record<string, any>

export type PlayerLockState = {
    id: string,
    session: string,
    realm: string,
}

export interface StatStorage {

    getAccount(id: string): Account

    registerAccount(id: string, password: string): Promise<Account>

    getScope(id: string): Scope;

    registerScope(id: string, owner: Account): Promise<Scope>;

    readData(scope: Scope, id: string): Promise<Stats>;

    saveData(scope: Scope, id: string, data: Object): Promise<void>;

    getLeaderboard(scope: Scope, field: string, limit: number): Promise<any[]>;

}

export type Account = {
    id: string,
    allowedScopes: string[],
    passwordHash: string
};


export type Scope = {

    id: string
    createdBy: string,
    createdAt: number,

}

export class ScopeWrapper {

    constructor(
        public scope: Scope,
        public collection: mongodb.Collection<any>
    ) { }

}

export async function init(): Promise<StatStorage> {

    let requiredVariables = ["MONGO_URL", "MONGO_USER", "MONGO_PASSWORD"];
    for (let variable of requiredVariables) {
        if (!process.env[variable]) throw Error(`No ${variable} environment variable specified.`)
    }

    let env = process.env;
    let storage: StatStorageImpl = new StatStorageImpl();

    await storage.connect(env.MONGO_URL, env.MONGO_USER, env.MONGO_PASSWORD);

    return storage;
}

class StatStorageImpl implements StatStorage {

    scopes: ScopeWrapper[]
    scopesCollection: mongodb.Collection

    accounts: Account[]
    accountsCollection: mongodb.Collection

    db: mongodb.Db;


    async connect(url: string, user: string, password: string): Promise<void> {

        let client = new mongodb.MongoClient(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            auth: { user, password }
        });

        await client.connect()

        this.db = client.db()

        await this.reloadScopes();
        await this.reloadAccounts();


    }

    async ensureCollectionExists(name: string, indexOptions?: mongodb.IndexOptions): Promise<mongodb.Collection> {

        let existing = await this.db.listCollections({name: 'scopes'}).next()
        if (existing) {
            return this.db.collection(name);
        }

        let collection = await this.db.createCollection(name)
        await collection.createIndex({ id: 1 }, indexOptions || { unique: true })
        return collection
        
    }

    async reloadScopes(): Promise<void> {
        
        this.scopes = []
        this.scopesCollection = await this.ensureCollectionExists('scopes')

        let scopes: Scope[] = await this.scopesCollection.find().toArray()

        for (let scope of scopes) {
            this.scopes.push(await this.loadScope(scope))
        }

        logger.info(`Loaded ${this.scopes.length} scopes.`)

    }

    async loadScope(scope: Scope): Promise<ScopeWrapper> {
        let collection = await this.ensureCollectionExists(scope.id)
        return { collection, scope }
    }

    async reloadAccounts(): Promise<void> {

        this.accountsCollection = await this.ensureCollectionExists('accounts')
        this.accounts = await this.accountsCollection.find().toArray()

        logger.info(`Loaded ${this.accounts.length} accounts.`)

    }

    getAccount(id: string): Account {
        for (let account of this.accounts) {
            if (account.id == id) return account;
        }
    }

    async registerAccount(id: string, password: string): Promise<Account> {

        logger.info(`Registering account ${id}`);

        if (this.getAccount(id)) throw Error(`Account ${id} already exists`)

        let account: Account = {
            id: id,
            passwordHash: hashPassword(password),
            allowedScopes: []
        }

        await this.db.collection('accounts').insertOne(account);

        return account;
    }


    async registerScope(id: string, owner: Account): Promise<Scope> {

        logger.info(`Registering scope ${id} for ${owner.id}...`)

        if (!id.match(/^(players|arbitrary):[A-Za-z_-]+$/)) throw Error("Malformed scope name");

        if (this.getScope(id) != null) throw Error(`Scope ${id} already exists`)

        owner.allowedScopes.push(id)
        await this.db.collection('accounts').replaceOne({ id: owner.id }, owner)

        let collection = await this.ensureCollectionExists(id);

        let scope = {
            id, 
            createdBy: owner.id,
            createdAt: Date.now()
        }

        let scopeWrapper = new ScopeWrapper(scope, collection)

        await this.db.collection('scopes').insertOne(scope);

        this.scopes.push(scopeWrapper);

        logger.info(`Successfully registered scope ${id} for ${owner.id}`)

        return scope;

    }

    getScope(id: string): Scope {
        return this.getScopeWrapper(id)?.scope
    }

    getScopeWrapper(id: string): ScopeWrapper {
        for (let scope of this.scopes) {
            if (scope.scope.id == id) return scope;
        }
    }

    async readData(scope: Scope, id: string): Promise<Stats> {

        let scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`)
        return await scopeWrapper.collection.findOne({ id })

    }

    async saveData(scope: Scope, id: string, data: Object): Promise<void> {

        let scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`)
        await scopeWrapper.collection.replaceOne({ id }, { id, ...data }, {
            upsert: true
        })

    }

    async getLeaderboard(scope: Scope, field: string, limit: number): Promise<any[]> {

        let scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`)

        return await scopeWrapper.collection.aggregate([{$sort: {field: 1}}, {$limit: limit}]).toArray()

    }

}