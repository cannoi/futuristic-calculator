FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# No external deps required (pure Node.js)
RUN npm install --omit=dev 2>/dev/null || true
COPY . .
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
