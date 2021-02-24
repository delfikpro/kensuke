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

}

export type Account = {
    login: string,
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
    accounts: Account[]
    db: mongodb.Db;


    async connect(url: string, user: string, password: string): Promise<void> {

        let client = new mongodb.MongoClient(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            auth: { user, password }
        });

        await client.connect()

        await this.reloadScopes();
        await this.reloadAccounts();

        this.db = client.db()

    }

    async reloadScopes(): Promise<void> {

        let collection = await this.db.createCollection('scopes')
        await collection.createIndex({ id: 1 }, { unique: true })
        this.scopes = []
        let scopes: Scope[] = await collection.find().toArray()

        for (let scope of scopes) {
            this.scopes.push(await this.loadScope(scope))
        }

        logger.info(`Loaded ${this.scopes.length} scopes.`)

    }

    async loadScope(scope: Scope): Promise<ScopeWrapper> {
        let collection = await this.db.createCollection(scope.id)
        return { collection, scope }
    }

    async reloadAccounts(): Promise<void> {

        let collection = await this.db.createCollection('accounts')
        await collection.createIndex({ login: 1 }, { unique: true })
        this.accounts = await collection.find().toArray()

        logger.info(`Loaded ${this.accounts.length} accounts.`)

    }

    getAccount(id: string): Account {
        for (let account of this.accounts) {
            if (account.login == id) return account;
        }
    }

    async registerAccount(id: string, password: string): Promise<Account> {

        logger.info(`Registering account ${id}`);

        if (this.getAccount(id)) throw Error(`Account ${id} already exists`)

        let account: Account = {
            login: id,
            passwordHash: hashPassword(password),
            allowedScopes: []
        }

        await this.db.collection('accounts').insertOne(account);

        return account;
    }


    async registerScope(id: string, owner: Account): Promise<Scope> {

        logger.info(`Registering scope ${id} for ${owner.login}...`)

        if (!id.match(/^\$[A-Za-z_-]+$/)) throw Error("Malformed scope name");

        if (this.getScope(id) != null) throw Error(`Scope ${id} already exists`)

        owner.allowedScopes.push(id)
        await this.db.collection('accounts').updateOne({ login: owner.login }, owner)

        let collection = await this.db.createCollection(id);

        let scope = {
            id, 
            createdBy: owner.login,
            createdAt: Date.now()
        }

        let scopeWrapper = new ScopeWrapper(scope, collection)

        await this.db.collection('scopes').insertOne(scope);

        this.scopes.push(scopeWrapper);

        logger.info(`Successfully registered scope ${id} for ${owner.login}`)

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
        await scopeWrapper.collection.updateOne({ id }, { id, ...data }, {
            upsert: true
        })

    }

}