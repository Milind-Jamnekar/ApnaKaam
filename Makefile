.PHONY: up down reset logs db-studio

up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f

db-studio:
	npx prisma studio
