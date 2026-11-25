FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3-venv libglib2.0-0 libstdc++6 && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/vision && /opt/vision/bin/pip install --no-cache-dir opencv-python-headless==4.10.0.84 numpy==1.26.4
COPY photo-model ./photo-model
RUN python3 photo-model/download.py /opt/myprayer/models
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY assets ./assets
ENV NODE_ENV=production PHOTO_PYTHON=/opt/vision/bin/python PHOTO_MODEL_DIR=/opt/myprayer/models
USER node
EXPOSE 8080
CMD ["npm", "start"]
