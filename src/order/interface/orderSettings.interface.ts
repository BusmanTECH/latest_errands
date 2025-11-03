export interface OrderSetting {
  readonly id: string;
  name: string;
  costPerKm: number;
  minCost: number;
  maxCost: number;
  distanceRang: number;
  deliveryTypePricing: {
    instant: number;
    schedule: number;
  };
  perKmPricing?: {
    normal: number;
    express: number;
  };
  surcharges?: {
    rainPerKm: number;
    trafficPerKm: number;
  };
  orderPercentage: number;
  limitAmount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
