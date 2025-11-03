/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AuthService } from './auth/auth.service';
import bodyParser from 'body-parser';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  // Middleware to parse raw body for Stripe webhooks
  // app.use('/orders/webhook', express.raw({ type: 'application/json' }));
  // This captures raw body and attaches it to req.rawBody
  app.use(
    '/orders/webhook',
    express.raw({ type: 'application/json' }),
    (req, res, next) => {
      // Store raw body so we can access it in the controller
      (req as any).rawBody = req.body;
      next();
    },
  );

  // Raw body middleware for Paystack webhooks (required for signature verification)
  // This must come BEFORE express.json() to capture the raw body

  // Raw body middleware for legacy endpoint
  app.use('/payment/webhook', express.raw({ type: 'application/json' }));

  // Default JSON body parser for other routes
  app.use(express.json());

  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Access-Token',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods',
      'Access-Control-Allow-Credentials',
    ],
    exposedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Access-Token',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods',
      'Access-Control-Allow-Credentials',
    ],
    // maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Errands API')
    .setDescription('API documentation for Errands service')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'BearerAuth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const configService = app.get(ConfigService);

  // Ensure default admin exists
  try {
    const authService = app.get(AuthService);
    await authService.ensureDefaultAdminAccount();
  } catch (e) {
    // Best-effort; don't block startup
    new Logger('Bootstrap').error(
      'Failed to ensure default admin',
      e?.message || e,
    );
  }
  const PORT = configService.get<number>('PORT') || 3000;

  await app.listen(PORT, '0.0.0.0', () => {
    logger.log(`
    🚀 ERRANDS BACKEND SERVER is running
    🔌 Server: http://localhost:${PORT}
    ⚡ Environment: ${configService.get('NODE_ENV', 'development')}
    🕒 Started at: ${new Date().toISOString()}
  `);
    console.log(
      `Running in ${configService.get<string>('NODE_ENV')} on port ${PORT}`,
    );
  });
}
bootstrap();
