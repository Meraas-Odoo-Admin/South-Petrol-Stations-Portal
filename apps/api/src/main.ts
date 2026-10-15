import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Round 20 (LAN phone testing over HTTPS): see apps/web/vite.config.ts's
// matching comment — the refresh-token cookie is Secure-flagged (CLAUDE.md
// rule 9, non-negotiable), which browsers refuse to set/send outside a
// secure context (HTTPS, or the special-cased "localhost"). A phone on the
// LAN is neither, so without this it can log in but never stays logged in.
// Optional: only kicks in when ../.certs/dev-*.pem exist (see vite.config.ts
// for how to generate them with mkcert), so `pnpm dev` with no certs
// generated still serves plain HTTP as before.
function loadHttpsOptions(): { cert: Buffer; key: Buffer } | undefined {
  const certPath = resolve(__dirname, '../../../.certs/dev-cert.pem');
  const keyPath = resolve(__dirname, '../../../.certs/dev-key.pem');
  if (!existsSync(certPath) || !existsSync(keyPath)) return undefined;
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

async function bootstrap() {
  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { httpsOptions });

  // The client's real address behind the proxies (after review, 15 Oct 2026).
  // Behind nginx every request otherwise comes "from" nginx: the per-address
  // login limit is shared by everyone, and the audit log's address column
  // says nothing. TRUST_PROXY_HOPS = how many proxies sit in front of the API:
  // 1 = the web container's nginx (infra/docker-compose.prod.yml), 2 = another
  // proxy for HTTPS in front of that. Never "true": then anyone could write
  // their own X-Forwarded-For and pick the address they are counted under.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fuel Tracking System API')
    .setDescription('API for the fuel fill-up tracking system')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  const protocol = httpsOptions ? 'https' : 'http';
  console.log(`API listening on ${protocol}://localhost:${port}/api/v1`);
}

bootstrap();
