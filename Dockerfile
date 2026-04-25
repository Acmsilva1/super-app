FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm install -g vercel@latest \
    && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["vercel", "dev", "--listen", "0.0.0.0:3000", "--yes"]
