FROM public.ecr.aws/docker/library/node:22-alpine AS builder
# Installed for the hosted image only, kept out of the published npm package.
ARG NEW_RELIC_AGENT_VERSION=14.12.0
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm install --no-save "newrelic@${NEW_RELIC_AGENT_VERSION}"
COPY . .
RUN npm run build:http

FROM public.ecr.aws/docker/library/node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/dist-http ./dist-http
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY docker/start-http-server.sh ./docker/
ENV NODE_ENV=production
EXPOSE 3000
# tini forwards SIGTERM to node, which ignores it as PID 1 without a handler.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker/start-http-server.sh"]
