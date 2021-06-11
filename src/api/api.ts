
import { logger, playerMap } from '@/helpers';
import express from 'express';
import { nodes } from '@/network/connection';

export function api() {

    const started = Date.now();

    const app = express();
    const port = 8998;
    app.get('/', (req, res) => {
        res.send({
            kensuke: '2.0',
            uptimeMillis: Date.now() - started,
            uptimeHours: (Date.now() - started) / 3600000
        });
    });

    app.get('/players', (req, res) => {

        const resp: any[] = [];
        for (let v in playerMap) {
            let player = playerMap[v];
            resp.push({
                uuid: player.id,
                session: player.currentSession?.sessionId,
                realm: player.currentSession?.realm,
                active: player.currentSession?.active,
                cached_scopes: Object.keys(player.stats)
            });
        }

        res.send({players: resp})
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
                players_online: Object.values(playerMap).filter(p => p.currentSession?.ownerNode == node).length,
            });
        }

        res.send({nodes: resp})
    });

    app.listen(port, () => {
        logger.info("Web interface is available at port :" + port);
    })

}