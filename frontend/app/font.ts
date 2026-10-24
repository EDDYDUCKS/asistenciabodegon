import { Big_Shoulders, Inter } from 'next/font/google';

// Títulos y números grandes. Con el eje opsz toma la forma "Display" en tamaños grandes.
export const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  variable: '--font-big-shoulders',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});
