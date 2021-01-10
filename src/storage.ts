
export type Stats = Record<string, any>

export interface StatStorage {

    provideStats(uuid: string): Promise<Stats>;

    saveStats(uuid: string, stats: Stats): Promise<void>;

}