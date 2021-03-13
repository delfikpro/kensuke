import { Collection, Db, MongoClient, IndexOptions } from 'mongodb';

import { logger, hashPassword } from '@/helpers';
import { Stats, Account, Scope } from '@/types/types';
import { ScopeWrapper } from '@/classes/index';

export class StatStorage {
    scopes: ScopeWrapper[];
    scopesCollection: Collection;

    accounts: Account[];
    accountsCollection: Collection;

    db: Db;

    static async init(): Promise<StatStorage> {
        const requiredVariables = ['MONGO_URL', 'MONGO_USER', 'MONGO_PASSWORD'];
        const env = process.env as Record<string, any>;

        for (const variable of requiredVariables) {
            if (!process.env[variable])
                throw Error(`No ${variable} environment variable specified.`);
        }

        const storage = new StatStorage();

        await storage.connect(
            env.MONGO_URL,
            env.MONGO_USER,
            env.MONGO_PASSWORD,
        );

        return storage;
    }

    async connect(url: string, user: string, password: string): Promise<void> {
        const client = new MongoClient(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            auth: { user, password },
        });

        await client.connect();

        this.db = client.db();

        await this.reloadScopes();
        await this.reloadAccounts();
    }

    async ensureCollectionExists(
        name: string,
        indexOptions?: IndexOptions,
    ): Promise<Collection> {
        const existing = await this.db
            .listCollections({ name: 'scopes' })
            .next();
        if (existing) {
            return this.db.collection(name);
        }

        const collection = await this.db.createCollection(name);
        await collection.createIndex(
            { id: 1 },
            indexOptions || { unique: true },
        );
        return collection;
    }

    async reloadScopes(): Promise<void> {
        this.scopes = [];
        this.scopesCollection = await this.ensureCollectionExists('scopes');

        const scopes: Scope[] = await this.scopesCollection.find().toArray();

        for (const scope of scopes) {
            this.scopes.push(await this.loadScope(scope));
        }

        logger.info(`Loaded ${this.scopes.length} scopes.`);
    }

    async loadScope(scope: Scope): Promise<ScopeWrapper> {
        const collection = await this.ensureCollectionExists(scope.id);
        return { collection, scope };
    }

    async reloadAccounts(): Promise<void> {
        this.accountsCollection = await this.ensureCollectionExists('accounts');
        this.accounts = await this.accountsCollection.find().toArray();

        logger.info(`Loaded ${this.accounts.length} accounts.`);
    }

    getAccount(id: string): Account {
        for (const account of this.accounts) {
            if (account.id == id) return account;
        }
    }

    async registerAccount(id: string, password: string): Promise<Account> {
        logger.info(`Registering account ${id}`);

        if (this.getAccount(id)) throw Error(`Account ${id} already exists`);

        const account: Account = {
            id: id,
            passwordHash: hashPassword(password),
            allowedScopes: [],
        };

        await this.db.collection('accounts').insertOne(account);

        return account;
    }

    async registerScope(id: string, owner: Account): Promise<Scope> {
        logger.info(`Registering scope ${id} for ${owner.id}...`);

        if (!id.match(/^(players|arbitrary):[A-Za-z_-]+$/))
            throw Error('Malformed scope name');

        if (this.getScope(id) !== null)
            throw Error(`Scope ${id} already exists`);

        owner.allowedScopes.push(id);
        await this.db
            .collection('accounts')
            .replaceOne({ id: owner.id }, owner);

        const collection = await this.ensureCollectionExists(id);

        const scope = {
            id,
            createdBy: owner.id,
            createdAt: Date.now(),
        };

        const scopeWrapper = new ScopeWrapper(scope, collection);

        await this.db.collection('scopes').insertOne(scope);

        this.scopes.push(scopeWrapper);

        logger.info(`Successfully registered scope ${id} for ${owner.id}`);

        return scope;
    }

    getScope(id: string): Scope {
        return this.getScopeWrapper(id)?.scope;
    }

    getScopeWrapper(id: string): ScopeWrapper {
        for (const scope of this.scopes) {
            if (scope.scope.id == id) return scope;
        }
    }

    async readData(scope: Scope, id: string): Promise<Stats> {
        const scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`);
        return await scopeWrapper.collection.findOne({ id });
    }

    async saveData(
        scope: Scope,
        id: string,
        data: Record<any, any>,
    ): Promise<void> {
        const scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`);
        await scopeWrapper.collection.replaceOne(
            { id },
            { id, ...data },
            {
                upsert: true,
            },
        );
    }

    async getLeaderboard(
        scope: Scope,
        field: string,
        limit: number,
    ): Promise<any[]> {
        const scopeWrapper = this.getScopeWrapper(scope.id);
        if (!scopeWrapper) throw Error(`Unknown scope ${scope.id}`);

        return await scopeWrapper.collection
            .aggregate([{ $sort: { field: 1 } }, { $limit: limit }])
            .toArray();
    }
}
