FROM node:14-alpine

COPY ./ .

RUN npm install -g ts-node typescript

RUN npm install

ENV PORT 8080
EXPOSE 8080

CMD npm start