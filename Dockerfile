FROM node:15.8.0-alpine3.10

#RUN npm i -g yarn
RUN yarn set version berry

RUN mkdir /app

WORKDIR /app

COPY . ./

RUN yarn && yarn tsc

CMD [ "yarn", "node", "./dist/server/index.js" ]
