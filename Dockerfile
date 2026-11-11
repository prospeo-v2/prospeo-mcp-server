FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:http
# New Relic agent for the hosted image only, kept out of the npm package.
# Loaded only when the deployment provides a license key.
RUN npm install --no-save newrelic@14.12.0

FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/dist-http ./dist-http
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
ENV NODE_ENV=production
EXPOSE 3000
# tini forwards SIGTERM to node, which ignores it as PID 1 without a handler.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "if [ -n \"$NEW_RELIC_LICENSE_KEY\" ]; then exec node --import newrelic/esm-loader.mjs -r newrelic dist-http/http-server.js; else exec node dist-http/http-server.js; fi"]
