SHELL := /bin/sh

.PHONY: install dev build start test lint docker-up docker-down docker-rebuild docker-restart swagger-json

install:
	npm install

dev:
	npm run start:dev

build:
	npm run build

start:
	npm run start

test:
	npm test

lint:
	npm run lint

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-rebuild:
	docker compose down
	docker compose up --build

docker-restart:
	docker compose down
	docker compose up -d

swagger-json:
	curl -s http://localhost:3000/api-json -o openapi.json

