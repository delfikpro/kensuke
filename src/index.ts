if (process.env.NODE_ENV !== 'production') require('module-alias/register');

import { logger } from '@/helpers';

import('./bootstrap').then(mod => {
    logger.info('Bootstrapping...');

    mod.bootstrap().then(() => logger.info('Successfully bootstrap.'));
});
