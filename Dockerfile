FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gpg ca-certificates \
    && wget https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && rm /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends dotnet-sdk-8.0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json dotnet-tools.json feminista.fsproj vite.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm install --ignore-scripts
RUN dotnet tool restore
RUN dotnet restore feminista.fsproj
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0

WORKDIR /app

COPY server.mjs ./
COPY data ./data
COPY --from=build /app/dist ./dist

CMD ["node", "server.mjs"]
