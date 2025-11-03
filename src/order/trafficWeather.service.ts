import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TrafficWeatherService {
  async getTrafficCondition(pickupLatLng: string, deliveryLatLng: string) {
    const key = process.env.GOOGLE_API;
    if (!key) {
      return {
        level: 'unknown' as const,
        ratio: null,
        duration: null,
        durationInTraffic: null,
      };
    }

    const params: any = {
      key,
      origins: pickupLatLng,
      destinations: deliveryLatLng,
      mode: 'driving',
      departure_time: 'now',
      units: 'metric',
    };

    try {
      const resp = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        { params },
      );

      const element = resp.data?.rows?.[0]?.elements?.[0];
      const duration = element?.duration?.value;
      const durationInTraffic = element?.duration_in_traffic?.value;

      let level: 'light' | 'moderate' | 'heavy' | 'unknown' = 'unknown';
      if (duration && durationInTraffic) {
        const ratio = durationInTraffic / duration;
        if (ratio < 1.2) level = 'light';
        else if (ratio < 1.5) level = 'moderate';
        else level = 'heavy';

        return { level, ratio, duration, durationInTraffic };
      }

      return { level, ratio: null, duration, durationInTraffic };
    } catch (e) {
      return {
        level: 'unknown' as const,
        ratio: null,
        duration: null,
        durationInTraffic: null,
      };
    }
  }

  async getWeatherCondition(lat: number, lng: number) {
    const googleKey =
      process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_API;
    if (googleKey) {
      try {
        const resp = await axios.get(
          'https://weather.googleapis.com/v1/currentConditions:lookup',
          {
            params: {
              location: `${lat},${lng}`,
              key: googleKey,
            },
          },
        );
        const data = resp.data;
        const conditions = (data?.currentConditions?.conditions || '')
          .toString()
          .toLowerCase();
        const precipitationChance = Number(
          data?.currentConditions?.precipitationChance || 0,
        );
        const isRain = conditions.includes('rain') || precipitationChance >= 30;
        return { condition: isRain ? 'rain' : 'clear', raw: data } as const;
      } catch (e) {
        // Continue to fallback
      }
    }

    const openWeatherKey = process.env.OPENWEATHER_API_KEY;
    if (openWeatherKey) {
      try {
        const resp = await axios.get(
          'https://api.openweathermap.org/data/2.5/weather',
          {
            params: {
              lat,
              lon: lng,
              appid: openWeatherKey,
              units: 'metric',
            },
          },
        );
        const data = resp.data;
        const weatherMain = (data?.weather?.[0]?.main || '').toLowerCase();
        const weatherDescription = (
          data?.weather?.[0]?.description || ''
        ).toLowerCase();
        const isRain =
          weatherMain.includes('rain') ||
          weatherDescription.includes('rain') ||
          weatherMain.includes('drizzle') ||
          weatherMain.includes('thunderstorm');

        return { condition: isRain ? 'rain' : 'clear', raw: data } as const;
      } catch (e) {
        // Continue to fallback
      }
    }

    return { condition: 'clear', raw: null } as const;
  }
}
