export interface Location {
    readonly id: string;
    pickupLocation: any;
    deliveryLocation: any;
    receiverDetails: any;
    pickupDetails: any;
    userId: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }
  