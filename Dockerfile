FROM node:20-alpine

WORKDIR /app

# Copier le serveur et les morceaux de référence
COPY server.mjs ./server.mjs
COPY src/tunesData.json ./tunesData.json
COPY dist ./public

# Dossier data persistant
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV DATA_DIR=/app/data

CMD ["node", "server.mjs"]
