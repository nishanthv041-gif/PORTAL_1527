import { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/appUrl';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/login/',
          '/_next/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
