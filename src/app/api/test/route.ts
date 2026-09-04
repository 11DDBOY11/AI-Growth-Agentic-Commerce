import { NextResponse } from 'next/server';
import { search_catalog, add_to_cart, get_cart_summary, create_payment_order, Cart } from '@/lib/commerce';

export async function GET() {
  try {
    const searchResults = search_catalog('shoes');
    
    const dummySession = "test_session";
    let cart: Cart = { items: [] };
    cart = add_to_cart(cart, 'prod_shoes_1', 1, dummySession);
    cart = add_to_cart(cart, 'prod_socks_1', 2, dummySession);
    const summary = get_cart_summary(cart);
    
    const order = await create_payment_order(summary.total, dummySession);

    return NextResponse.json({
      searchQuery: 'shoes',
      searchResults: searchResults.map(p => p.name),
      cartSummary: summary,
      razorpayOrder: order
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
