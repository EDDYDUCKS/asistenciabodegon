import type { MetadataRoute } from 'next';

// Herramienta interna: ningún buscador ni bot de IA debe indexarla.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
