
import { logger } from '@/helpers';
import express from 'express';
import { nodes } from '@/network/connection';
import { dataCache } from '@/data/data-cache';
import { sessionStorage } from '@/session/session-storage';

export function api() {

    const started = Date.now();

    const app = express();
    const port = 8998;
    app.get('/', (req, res) => {
        res.send({
            kensuke: '2.0',
            uptimeMillis: Date.now() - started,
            uptimeHours: (Date.now() - started) / 3600000,
            dataCache: dataCache.getStats(),
            sessions: sessionStorage.sessionMap.size
        });
    });

    app.get('/sessions', (req, res) => {

        const resp: any[] = [];
        for (let entry of sessionStorage.sessionMap) {
            const session = entry[1];
            resp.push(session);
        }

        res.send({sessions: resp})
    });

    app.get('/nodes', (req, res) => {

        const resp: any[] = [];
        for (let node of nodes) {
            resp.push({
                clientVersion: node.version,
                alive: node.isAlive,
                name: node.nodeName,
                ordinal: node.nodeIndex,
                owner: node.account?.id,
                used_scopes: node.scopes.map(s => s.id),
                players_online: Object.values(dataCache).filter(p => p.currentSession?.ownerNode == node).length,
            });
        }

        res.send({nodes: resp})
    });

    app.listen(port, () => {
        logger.info("REST metrics API is available at port :" + port);
    })

}