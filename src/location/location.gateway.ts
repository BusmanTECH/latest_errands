/* eslint-disable prettier/prettier */
// src/location/location.gateway.ts

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

  private connectedDrivers: Map<string, string> = new Map(); // email => socket.id
  private connectedUsers: Map<string, string> = new Map(); // userId => socket.id

  constructor(private readonly userService: AuthService) {}

  // handleConnection(client: Socket) {
  //   console.log(`Client connected: ${client.id}`);
  // }

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

  // handleDisconnect(client: Socket) {
  //   // Find email associated with socket
  //   const email = [...this.connectedDrivers.entries()]
  //     .find(([_, socketId]) => socketId === client.id)?.[0];

  //   if (email) {
  //     this.connectedDrivers.delete(email);
  //     this.server.emit('driver-left', { email });
  //     console.log(`Driver with email ${email} disconnected`);
  //   }
  // }
  handleDisconnect(client: Socket) {
    const { role, userId, email } = client.data || {};

    if (role === 'driver') {
      // Try by userId first; fall back to email
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

  // @SubscribeMessage('driver-location')
  // handleDriverLocation(@MessageBody() payload: DriverPayload, @ConnectedSocket() client: Socket) {
  //   const { email, latitude, longitude } = payload;

  //   // Store email and socket ID if not already
  //   if (!this.connectedDrivers.has(email)) {
  //     this.connectedDrivers.set(email, client.id);
  //     this.server.emit('driver-joined', { email });
  //     console.log(`Driver with email ${email} joined`,latitude, longitude);
  //     console.log(client.data)
  //   }

  //   // Emit location to all clients
  //   this.server.emit('location-update', { email, latitude, longitude });
  // }
  @SubscribeMessage('driver-location')
  async handleDriverLocation(
    @MessageBody() payload: DriverPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { email, latitude, longitude } = payload;

    // Store email and socket ID if not already
    if (!this.connectedDrivers.has(email)) {
      this.connectedDrivers.set(email, client.id);
      this.server.emit('driver-joined', { email });
    }

    // Emit location to all clients
    this.server.emit('location-update', { email, latitude, longitude });
  }

  //   @SubscribeMessage('user-location')
  // handleUserLocation(@MessageBody() payload: UserPayload, @ConnectedSocket() client: Socket) {
  //   const { userId, latitude, longitude } = payload;

  //   // Store user if not already connected
  //   if (!this.connectedUsers.has(userId)) {
  //     this.connectedUsers.set(userId, client.id);
  //     console.log(`User with ID ${userId} joined`);
  //   }

  //   // Emit user's location to all drivers (or everyone)
  //   this.server.emit('user-location-update', { userId, latitude, longitude });
  // }
  @SubscribeMessage('user-location')
  async handleUserLocation(
    @MessageBody() payload: UserPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, latitude, longitude } = payload;

    // Store user if not already connected
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, client.id);
      console.log(`User with ID ${userId} joined`);
    }

    // Emit user's location to all drivers (or everyone)
    this.server.emit('user-location-update', { userId, latitude, longitude });
  }
}
