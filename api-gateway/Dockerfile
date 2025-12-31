# 1. Base Image
FROM node:18-alpine

# 2. Set working directory
WORKDIR /app

# 3. Install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy source code
COPY . .

# 5. Expose the port
EXPOSE 3000

# 6. Start the application
CMD ["npm", "start"]
