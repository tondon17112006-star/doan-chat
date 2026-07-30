# File: server/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm install --omit=dev
COPY server server
EXPOSE 5000
CMD ["npm", "run", "start", "-w", "server"]
