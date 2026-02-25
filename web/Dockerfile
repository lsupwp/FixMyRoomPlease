FROM node:24.13.0-bookworm-slim

WORKDIR /app

# Native deps for packages like bcrypt (fallback to compile if no prebuild)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
