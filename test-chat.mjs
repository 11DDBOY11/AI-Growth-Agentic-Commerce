// Using global fetch available in Node.js 18+

async function sendChat(message, cart = { items: [] }, previousMessages = [], sessionId = "default") {
  const messages = [...previousMessages, { role: "user", content: message }];
  
  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, cart, sessionId })
  });
  
  const data = await response.json();
  return { data, messages: [...messages, data.message] };
}

async function runTests() {
  console.log("=== NORMAL FLOW (Under Cap, with Confirmation) ===");
  let state = await sendChat("I want to buy running shoes", { items: [] }, [], "session-idempotency");
  if (state.data.error) {
    console.error("API ERROR:", state.data.error);
    return;
  }
  state = await sendChat("Add prod_shoes_1 to cart", state.data.cart, state.messages, "session-idempotency");
  state = await sendChat("yes, proceed to checkout", state.data.cart, state.messages, "session-idempotency");
  console.log("Agent:", state.data.message?.content);
  console.log("Audit Log:", JSON.stringify(state.data.auditLog, null, 2));

  console.log("\n=== ADVERSARIAL FLOW 3: Duplicate Submission (Idempotency) ===");
  let state4 = await sendChat("Oops, wait, process it again please.", state.data.cart, state.messages, "session-idempotency");
  console.log("Audit Log:", JSON.stringify(state4.data.auditLog, null, 2));

  console.log("\n=== ADVERSARIAL FLOW 4: Second checkout in same session ===");
  // Buy socks in the same session
  let state5 = await sendChat("Now I want to buy socks.", state4.data.cart, state4.messages, "session-idempotency");
  state5 = await sendChat("Add prod_socks_1 to cart", state5.data.cart, state5.messages, "session-idempotency");
  state5 = await sendChat("yes, proceed to checkout", state5.data.cart, state5.messages, "session-idempotency");
  console.log("Audit Log:", JSON.stringify(state5.data.auditLog, null, 2));
  console.log("\n=== EDGE CASE 1: Vague query ===");
  let ec1 = await sendChat("I want something nice", { items: [] }, [], "edge-cases");
  console.log("Agent:", ec1.data.message?.content);

  console.log("\n=== EDGE CASE 2: Absurd quantity ===");
  let ec2 = await sendChat("Add 999 prod_laptop_1", ec1.data.cart, ec1.messages, "edge-cases");
  console.log("Agent:", ec2.data.message?.content);

  console.log("\n=== EDGE CASE 3: Negative quantity ===");
  let ec3 = await sendChat("Add -5 prod_shoes_1", ec2.data.cart, ec2.messages, "edge-cases");
  console.log("Agent:", ec3.data.message?.content);

  console.log("\n=== EDGE CASE 4: Change cart before confirm ===");
  let ec4 = await sendChat("Add 1 prod_socks_1", ec3.data.cart, ec3.messages, "edge-cases");
  ec4 = await sendChat("Wait, actually remove the socks.", ec4.data.cart, ec4.messages, "edge-cases");
  console.log("Agent:", ec4.data.message?.content);
  console.log("Cart after removal:", JSON.stringify(ec4.data.cart.items, null, 2));
}

runTests();
