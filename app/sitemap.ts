import { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/appUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl();

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];
}
