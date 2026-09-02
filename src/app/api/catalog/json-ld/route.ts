import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const catalogPath = path.join(process.cwd(), 'catalog.json');
    const data = fs.readFileSync(catalogPath, 'utf8');
    const catalog = JSON.parse(data);

    const jsonLd = catalog.map((product: any) => ({
      "@context": "https://schema.org",
      "@type": "Product",
      "productID": product.id,
      "name": product.name,
      "description": product.description,
      "offers": {
        "@type": "Offer",
        "price": product.price,
        "priceCurrency": "INR",
        "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    }));

    return NextResponse.json(jsonLd);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }
}
