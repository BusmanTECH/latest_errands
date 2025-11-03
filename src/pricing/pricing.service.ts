import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingSettings } from './entities/pricing-settings.entity';
// import { TrafficWeatherService } from '../order/trafficWeather.service';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingSettings)
    private readonly pricingSettingsRepo: Repository<PricingSettings>,
    // private readonly trafficWeather: TrafficWeatherService,
  ) {}

  async getSettingsList(): Promise<PricingSettings[]> {
    return this.pricingSettingsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getCurrentSettings(): Promise<PricingSettings | null> {
    const [settings] = await this.pricingSettingsRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    
    // If no settings exist, create default settings
    if (!settings) {
      const defaultSettings = this.pricingSettingsRepo.create({
        name: 'general',
        costPerKm: 180,
        minCost: 1000,
        maxCost: 50000,
        distanceRang: 10,
        orderPercentage: 10,
        limitAmount: -1000,
        deliveryTypePricing: {
          instant: 1000,
          schedule: 800,
        },
        perKmPricing: {
          express: 250,
          normal: 180,
        },
        surcharges: {
          rainPerKm: 50,
          trafficPerKm: 50,
        },
      });
      
      return await this.pricingSettingsRepo.save(defaultSettings);
    }
    
    return settings;
  }

  async updateSettings(
    id: string,
    data: Partial<PricingSettings>,
  ): Promise<PricingSettings> {
    await this.pricingSettingsRepo.update(id, data);
    const updated = await this.pricingSettingsRepo.findOne({ where: { id } });
    if (!updated) {
      throw new HttpException(
        'Pricing settings not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return updated;
  }

  async createSettings(
    data: Partial<PricingSettings>,
  ): Promise<PricingSettings> {
    const settings = this.pricingSettingsRepo.create(data);
    return this.pricingSettingsRepo.save(settings);
  }

  async calculateCost(payload: {
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
    deliveryType?: string;
  }) {
    const settings = await this.getCurrentSettings();
    if (!settings)
      throw new HttpException(
        'Order settings not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    // TODO: Re-implement traffic weather service integration when available
    // const pickup = `${payload.pickupLat},${payload.pickupLng}`;
    // const delivery = `${payload.deliveryLat},${payload.deliveryLng}`;
    // const distanceMatrix = await this.trafficWeather.getTrafficCondition(
    //   pickup,
    //   delivery,
    // );

    // Reuse order service formula:
    const costPerKm = Number(settings.costPerKm);
    const minCost = Number(settings.minCost);
    const maxCost = Number(settings.maxCost);
    const perKm =
      settings.perKmPricing?.[
        payload.deliveryType === 'express' ? 'express' : 'normal'
      ] || costPerKm;

    // Return settings for now - traffic service can be integrated later
    return { settings, costPerKm, minCost, maxCost, perKm };
  }
}
