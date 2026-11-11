FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:http
# New Relic agent for the hosted image only, kept out of the npm package.
# Loaded when the deployment sets NODE_OPTIONS.
RUN npm install --no-save newrelic@14.12.0

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist-http ./dist-http
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist-http/http-server.js"]
