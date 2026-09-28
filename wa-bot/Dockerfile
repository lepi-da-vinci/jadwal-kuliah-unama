FROM node:22-slim

# Set timezone ke Asia/Jakarta (WIB, UTC+7)
ENV TZ=Asia/Jakarta
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for puppeteer/chrome and tzdata
RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    && ln -fs /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
    && dpkg-reconfigure --frontend noninteractive tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
