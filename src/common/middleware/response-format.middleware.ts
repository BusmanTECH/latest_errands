/* eslint-disable prettier/prettier */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ResponseFormatMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Wrap res.json
    (res as any).json = (data: any) => {
      // If the controller already returned an enveloped shape, don't wrap again
      if (
        data &&
        typeof data === 'object' &&
        ('success' in data ||
          'statusCode' in data ||
          'status' in data ||
          'message' in data ||
          'data' in data)
      ) {
        return originalJson(data);
      }

      const statusCode = res.statusCode || 200;
      const success = statusCode >= 200 && statusCode < 300;
      const payload = {
        success,
        statusCode,
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        data,
      };
      return originalJson(payload);
    };

    // Wrap res.send for non-JSON sends (strings/buffers)
    (res as any).send = (body: any) => {
      try {
        // If body is already an enveloped shape, pass through
        if (
          body &&
          typeof body === 'object' &&
          ('success' in body ||
            'statusCode' in body ||
            'status' in body ||
            'message' in body ||
            'data' in body)
        ) {
          return originalSend(body);
        }

        // Attempt to JSON-wrap when possible
        const statusCode = res.statusCode || 200;
        const success = statusCode >= 200 && statusCode < 300;
        const payload = {
          success,
          statusCode,
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
          data: body,
        };
        // Respect content-type if not JSON
        const contentType = res.get('Content-Type') || '';
        if (
          typeof body === 'string' &&
          !contentType.includes('application/json')
        ) {
          return originalSend(body);
        }
        return originalJson(payload);
      } catch {
        return originalSend(body);
      }
    };

    next();
  }
}
