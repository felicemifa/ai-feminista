FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm -rf /var/lib/apt/lists/* /tmp/dotnet-install.sh

WORKDIR /app

COPY package.json package-lock.json dotnet-tools.json feminista.fsproj vite.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm install
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0

WORKDIR /app

COPY server.mjs ./
COPY --from=build /app/dist ./dist

CMD ["node", "server.mjs"]
