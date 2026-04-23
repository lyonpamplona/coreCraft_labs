FROM python:3.11-slim
WORKDIR /app
RUN pip install django requests pyzmq channels channels-redis daphne
COPY . .
EXPOSE 8000