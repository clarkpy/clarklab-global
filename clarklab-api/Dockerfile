FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY clarklab-api/package.json ./clarklab-api/
RUN npm ci -w clarklab-api
COPY clarklab-api ./clarklab-api
COPY scripts ./scripts
COPY clarklab-agent ./clarklab-agent
RUN npm run build -w clarklab-api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY clarklab-api/package.json ./clarklab-api/
RUN npm ci -w clarklab-api --omit=dev
COPY --from=build /app/clarklab-api/dist ./clarklab-api/dist
COPY clarklab-api/src/db/migrations ./clarklab-api/dist/db/migrations
COPY scripts ./scripts
COPY clarklab-agent ./clarklab-agent
EXPOSE 3000
CMD ["node", "clarklab-api/dist/index.js"]
