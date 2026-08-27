# -----------------------------
# Build stage
# -----------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install Python dependencies required by the asset pipeline
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create an isolated Python environment
RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir \
    pillow \
    numpy \
    scipy

# Copy dependency manifests first to maximize Docker layer caching
COPY package.json package-lock.json ./

# Install the exact dependency versions from package-lock.json
RUN npm ci

# Copy the project sources
COPY . .

# Generate production assets
RUN npm run assets

# Build the production bundle and route-aware Nginx SEO configuration
RUN npm run build

# Run runtime regressions against the exact production output
RUN npm run test:runtime


# -----------------------------
# Production stage
# -----------------------------
FROM nginx:1.30.4-alpine

# Production uses the route metadata generated directly from content/.
COPY --from=builder /app/dist/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
