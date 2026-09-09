FROM node:24.20.0-alpine3.24 AS dependencies

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.20.0-alpine3.24 AS runtime

ENV NODE_ENV="production"

WORKDIR /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node worker/src/worker.js ./worker/src/worker.js

USER node

CMD ["node", "worker/src/worker.js"]
