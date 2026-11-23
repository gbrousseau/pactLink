FROM node:22-bookworm-slim

WORKDIR /app

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
COPY redcap.csv /redcap.csv

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
