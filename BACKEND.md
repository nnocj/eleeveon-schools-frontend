npm i -g @nestjs/cli
nest new eleeveon-backend
cd eleeveon-backend


Choose:

npm

Then install the main backend tools:

npm install @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt // for authenticting
npm install prisma @prisma/client sequelize connection
npm install class-validator class-transformer
npm install helmet compression
npm install -D @types/bcrypt


eleeveon-backend/
  prisma/
    schema.prisma
  src/
    auth/
    accounts/
    sync/
    prisma/
    main.ts
    app.module.ts

Next, choose how you want to set up your database:

CONNECT EXISTING DATABASE:
  1. Configure your DATABASE_URL in prisma.config.ts
  2. Run prisma db pull to introspect your database.

CREATE NEW DATABASE:
  Local: npx prisma dev (runs Postgres locally in your terminal)
  Cloud: npx create-db (creates a free Prisma Postgres database)

Then, define your models in prisma/schema.prisma and run prisma migrate dev to apply your schema.


nest g module prisma
nest g service prisma  backend structure for prisma to work

nest g module auth
nest g controller auth       module, controller and service for auth
nest g service auth

nest g module accounts
nest g controller accounts          // for accounts
nest g service accounts

nest g module sync
nest g controller sync              //handling sync
nest g service sync


After that, we will write:

prisma/schema.prisma
src/prisma/prisma.service.ts
src/sync/sync.controller.ts
src/sync/sync.service.ts
src/sync/dto/sync.dto.ts
src/app.module.ts

This will give your frontend these endpoints:

POST /sync/push
POST /sync/pull
GET  /sync/status

I’ll write the first NestJS backend version as a universal sync backend. It will store all synced Dexie table records in one SyncRecord table first, so you can get cloud sync working before building full normalized backend tables.


npx prisma generate
npx prisma migrate dev --name init_sync
npm run start:dev


1. Run these in backend folder
npm install @prisma/client
npm install -D prisma
npx prisma generate

Then restart VS Code TypeScript server.

If still failing, run:


npx prisma generate
npx prisma migrate dev --name init_sync