# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY angular.json tsconfig*.json .postcssrc.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- Runtime: nginx sirve la SPA compilada y proxya /api y /media ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/keru-webapp/browser /usr/share/nginx/html
EXPOSE 80
