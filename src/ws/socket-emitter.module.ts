
import { Module } from '@nestjs/common';
import { SocketEmitter } from './socket-emitter.service';

@Module({
  providers: [SocketEmitter],
  exports: [SocketEmitter],
})
export class SocketEmitterModule {}
