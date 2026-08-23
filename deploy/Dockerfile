# Omni-IA auth-server — imagen Docker (VPS).
# Build:  docker build -t omni-auth -f deploy/Dockerfile .
# Run:    docker run -d --name omni-auth -p 4010:4010 \
#           --env-file auth-server/.env \
#           -v omni_auth_data:/app/data \
#           omni-auth

FROM node:22-slim

WORKDIR /app

COPY auth-server/package.json auth-server/package-lock.json ./
RUN npm ci --omit=dev

COPY auth-server/ ./

# data.db y archivos de estado viven en el volumen
ENV DB_PATH=/app/data/data.db
RUN mkdir -p /app/data

EXPOSE 4010
CMD ["node", "server.js"]
