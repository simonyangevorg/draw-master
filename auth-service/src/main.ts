import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Exactly one trusted hop: the gateway. It resolves the real client IP
  // through any host-level proxy (nginx real_ip, private ranges only) and
  // overwrites X-Forwarded-For with that single address, so req.ip, and with
  // it the login/register throttle, is per client rather than per proxy (B-15).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(8000);
  console.log('Auth service running on port 8000');
}
bootstrap();
