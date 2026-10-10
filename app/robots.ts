import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://nipoportal.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/dashboard/', '/login', '/login/', '/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
