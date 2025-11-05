

import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketAuth } from './socket-auth.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverLastLocation } from './entities/driver-last-location.entity';
import { SocketEmitter } from './socket-emitter.service';

@WebSocketGateway({ namespace: '/ws/riders', cors: { origin: '*', credentials: true } })
export class RidersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private heartbeats = new Map<string, number>(); 

  constructor(
    private auth: SocketAuth,
    private emitter: SocketEmitter,
    @InjectRepository(DriverLastLocation) private driverLocRepo: Repository<DriverLastLocation>,
  ) {}

  afterInit() { this.emitter.setServers({ riders: this.server }); }

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      const user = this.auth.verify(token);
      client.data.user = user; 
      if (user.role !== 'RIDER') throw new WsException('Only riders here');

      
      const driverId = user.sub;
      client.join(`rider:${driverId}`);
      this.emitter.emitRiderOnline(driverId);
      this.heartbeats.set(client.id, Date.now());
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const driverId = client.data?.user?.sub;
    if (driverId) this.emitter.emitRiderOffline(driverId);
    this.heartbeats.delete(client.id);
  }

  
  @SubscribeMessage('pong')
  pong(@ConnectedSocket() client: Socket) {
    this.heartbeats.set(client.id, Date.now());
  }

  @SubscribeMessage('rider:online')
  noop() {  }

  @SubscribeMessage('rider:location:update')
  async riderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { driverId?: string; coords: {lat:number; lng:number}; heading?:number; speed?:number; ts?:number },
  ) {
    const user = client.data?.user;
    if (!user) throw new WsException('unauth');
    const driverId = user.sub;

    const ts = body.ts ?? Date.now();
    await this.driverLocRepo.upsert({ driverId, lat: body.coords.lat, lng: body.coords.lng, ts: String(ts) }, ['driverId']);

    this.emitter.emitRiderLocation(driverId, body.coords, { heading: body.heading, speed: body.speed, ts });
  }
}
