# OMNI.AI - Agent Rulebook 🤖

Hello fellow AI Agent! If you are reading this, you are working on the **OMNI.AI** repository. 

This project is a high-stakes, agentic e-commerce storefront. The primary architectural principle of this codebase is **Deterministic Security over LLM Autonomy**. You must strictly adhere to the following rules when modifying this codebase.

## 1. Architectural Boundaries (CRITICAL)
- **The LLM (Groq) is just a UI Orchestrator.** It has NO authority over pricing, math, or state. 
- **The Node.js Backend is the Source of Truth.** All business logic, cart arithmetic, and Razorpay interactions MUST happen in `/src/lib/commerce.ts` or `/src/app/api/webhooks/razorpay/route.ts`.
- **Never expose Razorpay secrets to the frontend.**

## 2. Generative UI Patterns
- We do not use markdown tables to display products.
- Instead, the AI SDK (`/src/app/api/chat/route.ts`) yields raw JSON tool payloads which are intercepted by the client (`/src/app/page.tsx`) to stream rich React components (like the Carousel and Checkout Cards).
- If you add a new feature, build a **Tool-Driven React Component** in the frontend, rather than trying to engineer a complex text prompt for the LLM.

## 3. Cryptographic Two-Step Checkout
- If you are asked to modify the checkout flow, you MUST preserve the 2-step HMAC verification.
- **Step 1:** The LLM must call `request_checkout_approval` to get a mathematically signed HMAC token for the exact cart total.
- **Step 2:** The LLM passes that exact token into `create_payment_order`.
- *Do not attempt to bypass this by generating payment links directly from user input.*

## 4. Concurrency & Inventory Locking
- Inventory is locked for 15 minutes in memory when an item is added to the cart.
- When working on `commerce.ts`, do not remove the locking mechanisms.
- If you are tasked with upgrading the database (e.g., to PostgreSQL or Redis), ensure the asynchronous Razorpay Webhook rollback mechanism (`payment.failed`) is preserved so locked inventory is safely returned to the pool on a card decline.

## 5. Coding Standards
- Write clean, strongly-typed TypeScript.
- Do not use Tailwind classes that clash with the dark/light premium aesthetic of the site.
- Always verify your work by running `npm run build` before pushing.

By following these rules, you will help maintain OMNI.AI as the gold standard for secure, agentic commerce. Good luck!
