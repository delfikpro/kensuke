import * as mongoose from 'mongoose';
import { logger } from '.';

export type Stats = Record<string, any>

export interface StatStorage {

    provideStats(uuid: string): Promise<Stats>;

    saveStats(uuid: string, stats: Stats): Promise<void>;

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

    StatsDocument: mongoose.Model<mongoose.Document<any>>;

    async connect(url: string, user: string, password: string): Promise<mongoose.Mongoose> {

        let connection = await mongoose.connect(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            user: user,
            pass: password
        });

        this.StatsDocument = connection.model('StatsDocument', new mongoose.Schema({
            uuid: String,
            stats: Object
        }), process.env.MONGO_COLLECTION || 'playerStats');

        this.StatsDocument.createCollection({}, (err, collection) => {
            if (err) logger.error(err)
            else logger.info(`Using collection '${collection.collectionName}'`)
        });


        return connection;

    }

    provideStats(uuid: string): Promise<Stats> {
        return new Promise((resolve, reject) => {
            this.StatsDocument.find({ uuid }, (error, stats) => {
                if (error) {
                    console.error(`Unable to load stats for ${uuid}!`, error);
                    reject(error);
                } else {
                    console.log(stats);
                    resolve(stats.length == 0 ? {} : stats[0]);
                }
            });
        });
    }

    saveStats(uuid: string, stats: Stats): Promise<void> {
        return new Promise((resolve, reject) => {
            this.StatsDocument.updateOne(
                { uuid },
                { uuid, stats },
                {
                    upsert: true,
                    useFindAndModify: false
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
        });
    }

}