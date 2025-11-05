

import { WebSocketGateway, WebSocketServer, OnGatewayConnection, ConnectedSocket, SubscribeMessage, MessageBody, WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketAuth } from './socket-auth.util';
import { SocketEmitter } from './socket-emitter.service';

@WebSocketGateway({ namespace: '/ws/delivery_request', cors: { origin: '*', credentials: true } })
export class DeliveryRequestGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  constructor(private auth: SocketAuth, private emitter: SocketEmitter) {}
  afterInit() { this.emitter.setServers({ deliveryReq: this.server }); }

  handleConnection(client: Socket) {
    const user = this.auth.verify(client.handshake.auth?.token);
    if (user.role !== 'RIDER') { client.disconnect(); return; }
    client.data.user = user;
    client.join(`rider:${user.sub}`);
  }

  
  @SubscribeMessage('delivery:respond')
  async respond(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId: string; decision: 'ACCEPT'|'REJECT'; reason?: string }) {
    const riderId = client.data?.user?.sub;
    if (!riderId) throw new WsException('unauth');
    
    
  }
}
