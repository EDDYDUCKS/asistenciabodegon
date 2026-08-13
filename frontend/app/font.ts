import { Outfit, Inter } from 'next/font/google';

export const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-outfit',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});
