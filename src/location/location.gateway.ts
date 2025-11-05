


import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';

interface DriverPayload {
  email: string;
  latitude: number;
  longitude: number;
}

interface UserPayload {
  userId: string;
  latitude: number;
  longitude: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class LocationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedDrivers: Map<string, string> = new Map(); 
  private connectedUsers: Map<string, string> = new Map(); 

  constructor(private readonly userService: AuthService) {}

  
  
  

  handleConnection(client: Socket) {
    const email = [...this.connectedDrivers.entries()].find(
      ([_, socketId]) => socketId === client.id,
    )?.[0];

    if (email) {
      this.connectedDrivers.set(email, client.id);
      this.server.emit('driver-joined', { email });
    } else {
      console.warn(`Client connected without email: ${client.id}`);
    }
  }

  
  
  
  

  
  
  
  
  
  
  handleDisconnect(client: Socket) {
    const { role, userId, email } = client.data || {};

    if (role === 'driver') {
      
      if (userId && this.connectedDrivers.get(userId) === client.id) {
        this.connectedDrivers.delete(userId);
        this.server.emit('driver-left', { userId, email });
      } else if (email && this.connectedDrivers.get(email) === client.id) {
        this.connectedDrivers.delete(email);
        this.server.emit('driver-left', { email });
      }
    } else if (role === 'user') {
      if (userId && this.connectedUsers.get(userId) === client.id) {
        this.connectedUsers.delete(userId);
        this.server.emit('user-left', { userId });
      }
    }
  }

  
  
  

  
  
  
  
  
  
  

  
  
  
  @SubscribeMessage('driver-location')
  async handleDriverLocation(
    @MessageBody() payload: DriverPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { email, latitude, longitude } = payload;

    
    if (!this.connectedDrivers.has(email)) {
      this.connectedDrivers.set(email, client.id);
      this.server.emit('driver-joined', { email });
    }

    
    this.server.emit('location-update', { email, latitude, longitude });
  }

  
  
  

  
  
  
  
  

  
  
  
  @SubscribeMessage('user-location')
  async handleUserLocation(
    @MessageBody() payload: UserPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, latitude, longitude } = payload;

    
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, client.id);
      console.log(`User with ID ${userId} joined`);
    }

    
    this.server.emit('user-location-update', { userId, latitude, longitude });
  }
}
