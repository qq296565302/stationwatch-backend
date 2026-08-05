import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LogsService } from './modules/logs/logs.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // CORS
  const corsOrigin = config.get<string>('CORS_ORIGIN') || '*';
  app.enableCors({
    origin: corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
  });

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 全局校验
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // 全局过滤器 / 拦截器
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalInterceptors(new LoggingInterceptor(app.get(LogsService)));

  // Swagger
  if (config.get('SWAGGER_ENABLED') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('供电所值守云平台 API')
      .setDescription('后端接口文档（Nest.js + 内存数据存储）')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(config.get('SWAGGER_PATH') || 'api/docs', app, document);
  }

  const port = Number(config.get('PORT')) || 3000;
  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  if (config.get('SWAGGER_ENABLED') === 'true') {
    logger.log(`📚 Swagger docs: http://localhost:${port}/${config.get('SWAGGER_PATH') || 'api/docs'}`);
  }
}

bootstrap();
