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
  console.log("\n=== REGRESSION TEST: Cart mutation after summary ===");
  const sessionId = "session-regression-" + Date.now();
  
  // 1. Initial cart setup
  let cart = { items: [{ product: { id: "prod_shoes_1", name: "Shoes", price: 2500, stock: 10, tags: [], description: "" }, quantity: 1 }] };
  
  // 2. Ask for summary
  let t1 = await sendChat("Show my cart summary.", cart, [], sessionId);
  console.log("Agent (Summary):", t1.data.message?.content);
  
  // 3. Add an item
  let t2 = await sendChat("Add 1 pair of socks (prod_socks_1) to the cart and proceed.", t1.data.cart, t1.messages, sessionId);
  console.log("Agent (Add & Ask confirm):", t2.data.message?.content);
  
  // 4. Confirm checkout (agent should call create_payment_order)
  let t3 = await sendChat("yes confirm", t2.data.cart, t2.messages, sessionId);
  console.log("Agent (Confirm result):", t3.data.message?.content);
  console.log("Audit Log:", JSON.stringify(t3.data.auditLog, null, 2));
}

runTests();
