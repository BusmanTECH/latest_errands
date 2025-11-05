

import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SocketEmitter {
  private ridersNs?: Server;           
  private deliveryReqNs?: Server;      
  private deliveryNs?: Server;         

  setServers({ riders, deliveryReq, delivery }: { riders?: Server; deliveryReq?: Server; delivery?: Server; }) {
    this.ridersNs = riders ?? this.ridersNs;
    this.deliveryReqNs = deliveryReq ?? this.deliveryReqNs;
    this.deliveryNs = delivery ?? this.deliveryNs;
  }

  
  emitRiderOnline(driverId: string) {
    this.ridersNs?.emit('rider:online', { driverId, ts: Date.now() });
  }
  emitRiderOffline(driverId: string, reason = 'disconnect') {
    this.ridersNs?.emit('rider:offline', { driverId, ts: Date.now(), reason });
  }
  emitRiderLocation(driverId: string, coords: { lat:number; lng:number }, extra?: any) {
    this.ridersNs?.emit('rider:location', { driverId, coords, ts: Date.now(), ...extra });
  }

  
  pushDeliveryRequest(driverId: string, payload: any) {
    this.deliveryReqNs?.to(`rider:${driverId}`).emit('delivery:request', payload);
  }

  
  emitDeliveryUpdate(orderId: string, status: string) {
    this.deliveryNs?.to(`order:${orderId}`).emit('delivery:update', { orderId, status, ts: Date.now() });
  }
  mirrorRiderLocationToOrder(orderId: string, driverId: string, coords: {lat:number; lng:number}) {
    this.deliveryNs?.to(`order:${orderId}`).emit('rider:location', { driverId, coords, ts: Date.now() });
  }
}
