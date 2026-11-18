import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { requireEnv } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [requireEnv('RABBITMQ_URL')],
      queue: 'stats_queue',
      queueOptions: { durable: true },
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();
  await app.listen(8000);
}
bootstrap();
