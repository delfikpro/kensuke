import * as winston from 'winston';

const logFormat = [
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.simple(),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`),
];

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(...logFormat),
    transports: [
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), ...logFormat),
        }),
    ],
});
