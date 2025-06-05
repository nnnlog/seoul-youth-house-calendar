FROM node:lts

RUN mkdir -p /tmp

WORKDIR /tmp

RUN npm i -g pnpm

RUN git clone https://github.com/nnnlog/seoul-youth-house-calendar

RUN mv seoul-youth-house-calendar/* ./

RUN pnpm i --frozen-lockfile

RUN npx tsc

RUN mkdir -p /app

RUN cp -r dist/* /app

RUN cp package.json /app
RUN cp pnpm-lock.yaml /app

WORKDIR /app

RUN pnpm i --prod

ENTRYPOINT node ./index.js