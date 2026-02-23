FROM node:20-alpine AS base

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3001 3002 3003

CMD ["node", "dist/index.js"]
