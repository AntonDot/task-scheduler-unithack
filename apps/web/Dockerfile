# Build: dependencies strictly from package-lock.json (npm ci), static bundle by Vite
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Run: nginx serves the bundle and proxies /api and /ws to core-api.
# Port, backend address and DNS resolver (127.0.0.11 is Docker's) are config,
# substituted from the environment at start.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
RUN rm -f /etc/nginx/conf.d/default.conf

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} \
    PORT=80 \
    CORE_API_URL=http://core-api:8000 \
    NGINX_RESOLVER=127.0.0.11
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
