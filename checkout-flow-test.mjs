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
  console.log("\n=== TEST: Checkout Flow ===");
  const sessionId = "session-flow-" + Date.now();
  
  let cart = { items: [] };
  
  // 1. Search and add
  let t1 = await sendChat("I want to buy shoes (prod_shoes_1). Add 1 to cart.", cart, [], sessionId);
  console.log("Agent (Add):", t1.data.message?.content);
  
  // 2. Ask to checkout
  let t2 = await sendChat("Checkout now.", t1.data.cart, t1.messages, sessionId);
  console.log("Agent (Summary & Ask Confirm):", t2.data.message?.content);
  
  // 3. Confirm
  let t3 = await sendChat("yes go ahead", t2.data.cart, t2.messages, sessionId);
  console.log("Agent (Process):", t3.data.message?.content);
  console.log("Audit Log:", JSON.stringify(t3.data.auditLog, null, 2));
}

runTests();
