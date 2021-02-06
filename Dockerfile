FROM node:8.9.1-alpine

RUN npm i -g yarn && yarn set version berry

RUN mkdir /app

WORKDIR /app

COPY . ./

RUN yarn && yarn tsc

CMD [ "yarn node ./dist/server/index.js" ]
