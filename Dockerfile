# The card catalog is ~70MB of JSON that server.js parses at boot, so the
# runtime image is not a distroless/slim one. node:22-bookworm-slim is enough.
FROM node:22-bookworm-slim

# openssl is needed at runtime: with TLS_CERT/TLS_KEY unset and BEHIND_PROXY
# unset, the server mints its own self-signed LAN certificate.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The service user owns the mounted volume, so it has to exist in the image.
RUN useradd --system --create-home --shell /usr/sbin/nologin mtg

# Dependencies first so an app-only change does not reinstall them.
# Only package.json and the lockfile are copied: the app is plain CommonJS
# with no build step.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=root:root . .

# Mutable state lives on the volume, not in the image layer.
ENV DATA_DIR=/data
RUN mkdir -p /data && chown mtg:mtg /data

USER mtg
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    BEHIND_PROXY=1 \
    NODE_OPTIONS=--max-old-space-size=1024

EXPOSE 8080

# node --check is the same parse the app does on require, so this fails the
# build on a syntax error instead of crash-looping in production.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node --check /app/server.js && node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
