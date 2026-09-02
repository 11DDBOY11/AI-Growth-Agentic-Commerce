import Razorpay from 'razorpay';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function run() {
  try {
    const paymentLink = await razorpay.paymentLink.create({
      amount: 250000,
      currency: "INR",
      description: "Checkout Agent Order",
      customer: {
        name: "Test User",
        email: "test@example.com",
        contact: "9999999999"
      },
      notify: {
        sms: false,
        email: false
      },
      reminder_enable: false
    });
    console.log(paymentLink);
  } catch (err) {
    console.error(err);
  }
}

run();
