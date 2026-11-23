FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ARG APP_SHA=local
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 AUTO_MIGRATE=1 APP_SHA=$APP_SHA
LABEL org.opencontainers.image.revision=$APP_SHA
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=6s --start-period=15s CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
