import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { orderStatusStore, sessionStore } from '@/lib/commerce';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'dev_webhook_secret';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    
    // Safety check
    if (!payload.payload || !payload.payload.payment || !payload.payload.payment.entity) {
      return NextResponse.json({ success: true });
    }

    const paymentEntity = payload.payload.payment.entity;
    const session_id = paymentEntity.notes?.session_id;
    const payment_id = paymentEntity.id;

    if (!session_id) {
       return NextResponse.json({ success: true });
    }

    // Find the corresponding order in orderStatusStore by session_id
    let order_id = null;
    let orderRecord = null;
    for (const [key, value] of orderStatusStore.entries()) {
      if (value.sessionId === session_id) {
        order_id = key;
        orderRecord = value;
        break;
      }
    }

    if (!orderRecord) {
      return NextResponse.json({ success: true }); // Unknown session order, ignore
    }

    if (event === 'payment.captured' || event === 'payment.authorized') {
      orderRecord.status = 'paid';
      orderRecord.payment_id = payment_id;
    } else if (event === 'payment.failed') {
      orderRecord.status = 'failed';
      orderRecord.payment_id = payment_id;
      
      // Rollback the session so user can retry
      const session = sessionStore.get(orderRecord.sessionId);
      if (session) {
        session.hasCompletedCheckout = false;
        session.pendingOrderAmount = null;
        session.lastOrderAmount = null; // Clear so idempotency check passes on retry
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Webhook Error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
