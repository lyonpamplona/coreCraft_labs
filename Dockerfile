FROM node:20-slim AS linter-js
WORKDIR /app
COPY package.json .eslintrc.json ./
RUN npm install
COPY static/ static/
RUN npx eslint static/js/panel/

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --shell /usr/sbin/nologin appuser
COPY . .
RUN ruff check core/ manage.py
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8000