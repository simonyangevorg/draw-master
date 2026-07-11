import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // nginx sets X-Forwarded-For; trust one hop so ThrottlerGuard keys on the real client IP
  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(8000);
  console.log('Auth service running on port 8000');
}
bootstrap();
