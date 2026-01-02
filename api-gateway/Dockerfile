# 1. Base Image
FROM node:18-alpine

# 2. Install System Dependencies for Canvas & Python (for build)
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    python3

# 3. Set working directory
WORKDIR /app

# 4. Install dependencies
COPY package*.json ./
RUN npm install

# 5. Copy source code
COPY . .

# 6. Expose the port
EXPOSE 3000

# 7. Start the application
CMD ["npm", "start"]