import fs from 'fs';
import path from 'path';
import Razorpay from 'razorpay';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  tags: string[];
  description: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
}

// Load catalog
const catalogPath = path.join(process.cwd(), 'catalog.json');
let catalog: Product[] = [];
try {
  const data = fs.readFileSync(catalogPath, 'utf8');
  catalog = JSON.parse(data);
} catch (error) {
  console.error('Failed to load catalog.json:', error);
}

const unmetDemandPath = path.join(process.cwd(), 'unmet-demand.json');

export function log_unmet_demand(query: string) {
  try {
    let data: {query: string, count: number, timestamp: string}[] = [];
    if (fs.existsSync(unmetDemandPath)) {
      data = JSON.parse(fs.readFileSync(unmetDemandPath, 'utf8'));
    }
    
    const normalizedQuery = query.toLowerCase().trim();
    const existingEntry = data.find(item => item.query === normalizedQuery);
    
    if (existingEntry) {
      existingEntry.count = (existingEntry.count || 1) + 1;
      existingEntry.timestamp = new Date().toISOString(); // Update to most recent timestamp
    } else {
      data.push({ query: normalizedQuery, count: 1, timestamp: new Date().toISOString() });
    }
    
    fs.writeFileSync(unmetDemandPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to log unmet demand", err);
  }
}

export function get_unmet_demand() {
  try {
    if (fs.existsSync(unmetDemandPath)) {
      const data = JSON.parse(fs.readFileSync(unmetDemandPath, 'utf8'));
      // Return sorted by count descending (most-asked-for at the top)
      return data.sort((a: any, b: any) => (b.count || 1) - (a.count || 1));
    }
  } catch (err) {
    console.error("Failed to read unmet demand", err);
  }
  return [];
}

/**
 * Searches the catalog by query string (matches name, description, or tags).
 */
export function search_catalog(query: string): Product[] {
  const lowerQuery = query.toLowerCase();
  const results = catalog.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery) ||
    p.tags.some(t => t.toLowerCase().includes(lowerQuery))
  );

  if (results.length === 0) {
    log_unmet_demand(query);
  }

  return results;
}

/**
 * Gets product details by ID.
 */
export function get_product_details(id: string): Product | null {
  return catalog.find(p => p.id === id) || null;
}

/**
 * Adds a product to a given cart state.
 * Returns updated cart or throws an error if out of stock/invalid.
 */
export function add_to_cart(cart: Cart, id: string, quantity: number): Cart {
  if (quantity <= 0) throw new Error("Quantity must be positive.");
  
  const product = get_product_details(id);
  if (!product) throw new Error(`Product with id ${id} not found.`);
  
  const existingItemIndex = cart.items.findIndex(item => item.product.id === id);
  const currentQty = existingItemIndex >= 0 ? cart.items[existingItemIndex].quantity : 0;
  
  if (currentQty + quantity > product.stock) {
    throw new Error(`Cannot add ${quantity} of ${product.name}. Only ${product.stock} in stock.`);
  }

  const newItems = [...cart.items];
  if (existingItemIndex >= 0) {
    newItems[existingItemIndex].quantity += quantity;
  } else {
    newItems.push({ product, quantity });
  }

  return { items: newItems };
}

/**
 * Removes a product from a given cart state.
 * If quantity is not provided, removes the product entirely.
 */
export function remove_from_cart(cart: Cart, id: string, quantity?: number): Cart {
  const existingItemIndex = cart.items.findIndex(item => item.product.id === id);
  if (existingItemIndex < 0) {
    throw new Error(`Product with id ${id} is not in the cart.`);
  }
  
  const newItems = [...cart.items];
  if (quantity !== undefined && quantity > 0) {
    newItems[existingItemIndex] = { ...newItems[existingItemIndex], quantity: newItems[existingItemIndex].quantity - quantity };
    if (newItems[existingItemIndex].quantity <= 0) {
      newItems.splice(existingItemIndex, 1);
    }
  } else {
    // Remove completely
    newItems.splice(existingItemIndex, 1);
  }

  return { items: newItems };
}

/**
 * Gets a summary of the cart including total price.
 */
export function get_cart_summary(cart: Cart) {
  const total = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  return {
    items: cart.items.map(i => ({
      id: i.product.id,
      name: i.product.name,
      quantity: i.quantity,
      price_per_unit: i.product.price,
      subtotal: i.product.price * i.quantity
    })),
    total
  };
}

import crypto from 'crypto';

/**
 * Creates a Razorpay order for the specified amount (in INR).
 */
export async function create_payment_order(amountINR: number, sessionId: string) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials missing in environment variables.");
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  const options = {
    amount: amountINR * 100, // Razorpay amount is in paise
    currency: "INR",
    description: "OMNI.AI Order",
    reference_id: `ref_${Date.now()}`,
    notes: {
      session_id: sessionId
    }
  };

  try {
    const paymentLink = await razorpay.paymentLink.create(options as any);
    return {
      id: paymentLink.id,
      short_url: paymentLink.short_url,
      status: paymentLink.status
    };
  } catch (error) {
    console.error("Razorpay payment link creation failed:", error);
    throw new Error("Payment link creation failed.");
  }
}

const HMAC_SECRET = process.env.HMAC_SECRET || 'dev_secret_key_123';

export function generate_checkout_token(amount: number, sessionId: string): string {
  const payload = JSON.stringify({ amount, sessionId, exp: Date.now() + 5 * 60 * 1000 });
  const base64Payload = Buffer.from(payload).toString('base64');
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(base64Payload).digest('hex');
  return `${base64Payload}.${signature}`;
}

export function verify_checkout_token(token: string, amount: number, sessionId: string): boolean {
  try {
    const [base64Payload, signature] = token.split('.');
    if (!base64Payload || !signature) return false;

    const expectedSignature = crypto.createHmac('sha256', HMAC_SECRET).update(base64Payload).digest('hex');
    if (signature !== expectedSignature) return false;

    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
    if (payload.amount !== amount || payload.sessionId !== sessionId || Date.now() > payload.exp) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

// Map order_id -> { sessionId, status, payment_id }
export const orderStatusStore = new Map<string, { sessionId: string, status: string, payment_id?: string }>();

// Map sessionId -> { hasCompletedCheckout, lastOrderAmount, pendingOrderAmount }
export const sessionStore = new Map<string, { hasCompletedCheckout: boolean, lastOrderAmount: number | null, pendingOrderAmount: number | null }>();

/**
 * Checks the status of a Razorpay order via our global store (updated by webhooks).
 */
export async function check_payment_status(order_id: string, simulate_status?: 'success' | 'failed') {
  // We keep simulate_status param for backwards compatibility with the prompt for now,
  // but we prioritize real webhook state if it exists.
  const record = orderStatusStore.get(order_id);
  
  if (record) {
    return {
      order_id,
      status: record.status,
      payment_id: record.payment_id,
      reason: record.status === 'failed' ? 'Your payment failed according to our records.' : undefined
    };
  }

  // Fallbacks for testing if no webhook hit
  if (simulate_status === 'failed') {
    return {
      order_id,
      status: 'failed',
      reason: 'Your bank declined the transaction due to insufficient funds or a security block.'
    };
  }
  if (simulate_status === 'success') {
    return {
      order_id,
      status: 'paid'
    };
  }

  return {
    order_id,
    status: 'created',
    message: 'Awaiting payment completion.'
  };
}
