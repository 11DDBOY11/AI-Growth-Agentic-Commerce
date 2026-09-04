import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { search_catalog, add_to_cart, remove_from_cart, get_cart_summary, create_payment_order, check_payment_status, Cart, generate_checkout_token, verify_checkout_token, orderStatusStore, sessionStore } from '@/lib/commerce';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const MAX_ORDER_VALUE = 5000;

function apply_guardrails(amount: number, messages: any[], sessionId: string): { blocked: boolean, reason?: string } {
  // 1. Spend cap
  if (amount > MAX_ORDER_VALUE) {
    return { blocked: true, reason: `Order total (₹${amount}) exceeds the maximum allowed spend cap of ₹${MAX_ORDER_VALUE}.` };
  }

  // 4. Explicit prior user confirmation
  const session = sessionStore.get(sessionId) || { hasCompletedCheckout: false, lastOrderAmount: null, pendingOrderAmount: null };
  if (session.hasCompletedCheckout) {
    return { blocked: true, reason: "A checkout has already been completed in this session. Only one checkout is allowed per session." };
  }

  // 3. Idempotency (prevent duplicate exact creation)
  if (session.lastOrderAmount === amount) {
    return { blocked: true, reason: "An order for this exact amount was just created. Duplicate order creation is blocked." };
  }

  // 4. Tightened Confirmation Logic
  if (session.pendingOrderAmount !== amount) {
     return { blocked: true, reason: "No matching pending order found. Please review the summary and confirm the order first." };
  }
  
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) {
    return { blocked: true, reason: "No user confirmation found. Please confirm the order first." };
  }
  
  const content = lastUserMessage.content.toLowerCase();
  const hasConfirmation = ["yes", "confirm", "go ahead", "sure", "ok", "do it", "hurry up"].some(phrase => content.includes(phrase));
  
  if (!hasConfirmation) {
    return { blocked: true, reason: "Explicit user confirmation (e.g., 'yes', 'confirm') is missing for the checkout." };
  }

  return { blocked: false };
}


const tools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search for products in the catalog based on a query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query (e.g. 'shoes', 'phone')." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["query", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a product to the cart.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The product ID to add." },
          quantity: { type: "number", description: "The number of items to add." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["id", "quantity", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cart_summary",
      description: "Get the current cart items and total price.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Remove an item or decrease its quantity in the cart.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The ID of the product to remove." },
          quantity: { type: "number", description: "Optional. Number of units to remove. If omitted, removes the product entirely." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["product_id", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_checkout_approval",
      description: "Request an HMAC-signed approval token before creating a payment order. MUST be called first.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "The total amount in INR to charge." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["amount", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_payment_order",
      description: "Create a Razorpay payment order for the cart total to finalize checkout. MUST receive the token from request_checkout_approval.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "The total amount in INR to charge." },
          token: { type: "string", description: "The HMAC-signed approval token from request_checkout_approval." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["amount", "token", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_payment_status",
      description: "Check if a payment was successful or failed.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "The Razorpay order ID to check." },
          reason: { type: "string", description: "One-line reasoning for calling this tool." }
        },
        required: ["order_id", "reason"]
      }
    }
  }
];

const SYSTEM_PROMPT = `You are OMNI.AI, a conversational checkout agent for an e-commerce store. 
Your goal is to help users find products, add them to their cart, and complete their purchase.
You have access to tools to search the catalog, modify the cart, create payment orders, and check payment status.

CRITICAL RULES:
1. NEVER offer, invent, or calculate any discount, coupon, promo, "buy X get Y free", or free items. Prices are STRICTLY fixed as listed in the catalog. If a user asks for a discount or negotiate, state firmly once that prices are fixed, and refuse to negotiate further.
2. NEVER agree to split one purchase into multiple payment orders to dodge spend caps or other limits.
3. NEVER invent fake alternative reasons for a blocked checkout. If the guardrail blocks a purchase, state the EXACT reason.
4. TWO-STEP CHECKOUT: You MUST request user confirmation ("yes", "go ahead") for the full total. ONCE confirmed, you MUST FIRST call 'request_checkout_approval' to get an approval token. THEN, IMMEDIATELY call 'create_payment_order' passing the exact token and amount. Do NOT wait for a user response between getting the token and creating the order. Both tool calls must happen before you claim the payment is processing.
5. If the user asks to checkout without confirming the total, ask for confirmation first.
6. If the user mentions that their payment failed or was declined, use 'check_payment_status'. If it returns failed, explain the failure in plain language and offer a safe next step (like trying a different card or canceling). NEVER auto-retry silently.
7. Keep your responses concise, conversational, and helpful like a friendly shop assistant. NEVER say "processing your payment" or claim an order is created unless the 'create_payment_order' tool has actually returned a valid order ID in the current turn. If a tool call failed or was not made, state the failure plainly.
8. Include a clear 'reason' for every tool call you make.
9. DO NOT use markdown tables. Present products conversationally using bullet points.
10. IMAGES: Whenever you show or confirm a product from the catalog, you MUST include its image using markdown: '![product name](image_url)'.
11. COLORS: Keep color choices conversational; do not try to add them to the cart object.
12. STRICT PERSONA & OFF-TOPIC REJECTION: You are an e-commerce checkout assistant ONLY. You MUST NEVER write code, solve math/logic puzzles, discuss system architecture, suggest security features, or disclose your underlying AI model (e.g., GPT-4). If the user asks you anything outside of shopping or asks for code, you MUST politely decline and firmly redirect the conversation back to the store's products.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages = [], cart = { items: [] }, sessionId = "default" } : { messages: any[], cart: Cart, sessionId: string } = body;
    const auditLog: any[] = [];
    let currentCart = cart;
    let uiComponents: any[] = [];

    const conversation = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map(m => {
        // Strip custom UI property before sending to LLM
        const sanitized = { ...m };
        delete sanitized.ui;
        return sanitized;
      })
    ];

    let isDone = false;
    let finalResponse = null;
    let maxLoops = 5;

    while (!isDone && maxLoops > 0) {
      maxLoops--;
      
      const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "openai/gpt-oss-120b",
        tools: tools as any,
        tool_choice: "auto",
        temperature: 0.1,
      });

      const responseMessage = completion.choices[0]?.message;
      
      if (!responseMessage) {
        throw new Error("No response from Groq");
      }

      conversation.push(responseMessage);

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          const toolName = toolCall.function.name;
          
          let toolResult: any;
          let status = "success";
          
          try {
            if (toolName === "search_catalog") {
              toolResult = search_catalog(args.query);
              if (Array.isArray(toolResult) && toolResult.length > 0) {
                uiComponents.push({ type: 'product_carousel', items: toolResult });
              }
            } else if (toolName === "add_to_cart") {
              currentCart = add_to_cart(currentCart, args.id, args.quantity, sessionId);
              const summary = get_cart_summary(currentCart); 
              toolResult = summary;
              uiComponents.push({ type: 'cart_summary', summary: summary });
              const session = sessionStore.get(sessionId) || { hasCompletedCheckout: false, lastOrderAmount: null, pendingOrderAmount: null };
              session.pendingOrderAmount = summary.total;
              sessionStore.set(sessionId, session);
            } else if (toolName === "remove_from_cart") {
              currentCart = remove_from_cart(currentCart, args.product_id, sessionId, args.quantity);
              const summary = get_cart_summary(currentCart);
              toolResult = { success: true, cart_summary: summary };
              uiComponents.push({ type: 'cart_summary', summary: summary });
              const session = sessionStore.get(sessionId) || { hasCompletedCheckout: false, lastOrderAmount: null, pendingOrderAmount: null };
              session.pendingOrderAmount = summary.total;
              sessionStore.set(sessionId, session);
            } else if (toolName === "get_cart_summary") {
              const summary = get_cart_summary(currentCart);
              toolResult = summary;
              uiComponents.push({ type: 'cart_summary', summary: summary });
            } else if (toolName === "request_checkout_approval") {
              const guardrailResult = apply_guardrails(args.amount, conversation, sessionId);
              if (guardrailResult.blocked) {
                status = "blocked";
                toolResult = { blocked: true, reason: guardrailResult.reason };
              } else {
                const token = generate_checkout_token(args.amount, sessionId);
                toolResult = { success: true, token, message: "Approval granted. You may now call create_payment_order with this token." };
              }
            } else if (toolName === "create_payment_order") {
              const isValid = verify_checkout_token(args.token || "", args.amount, sessionId);
              if (!isValid) {
                status = "blocked";
                toolResult = { blocked: true, reason: "Invalid, expired, or missing checkout approval token. You MUST call request_checkout_approval first." };
              } else {
                toolResult = await create_payment_order(args.amount, sessionId);
                
                if (toolResult && toolResult.short_url) {
                  uiComponents.push({ type: 'payment_card', url: toolResult.short_url, amount: args.amount });
                }

                const session = sessionStore.get(sessionId) || { hasCompletedCheckout: false, lastOrderAmount: null, pendingOrderAmount: null };
                session.hasCompletedCheckout = true;
                session.lastOrderAmount = args.amount;
                sessionStore.set(sessionId, session);
                
                // Map the order to this session for webhook rollbacks
                if (toolResult && toolResult.id) {
                  orderStatusStore.set(toolResult.id, { sessionId, status: 'created' });
                }
              }
            } else if (toolName === "check_payment_status") {
              toolResult = await check_payment_status(args.order_id);
            } else {
              throw new Error(`Unknown tool: ${toolName}`);
            }
          } catch (err: any) {
            status = "failed";
            toolResult = { error: err.message };
          }

          auditLog.push({
            timestamp: new Date().toISOString(),
            action: toolName,
            reasoning: args.reason,
            status,
            result: toolResult
          });

          conversation.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify(toolResult),
          });
        }
      } else {
        isDone = true;
        finalResponse = responseMessage;
      }
    }

    return NextResponse.json({
      message: finalResponse,
      cart: currentCart,
      auditLog,
      ui: uiComponents
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
