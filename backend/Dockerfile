FROM node:20-bullseye-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]