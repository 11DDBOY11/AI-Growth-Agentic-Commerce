"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Search, ShoppingCart, ShieldAlert, CreditCard, CheckCircle, XCircle } from "lucide-react";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role: string, content: string, ui?: any[]}[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [cart, setCart] = useState({ items: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list');
  const [isAuditTrailOpen, setIsAuditTrailOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  
  const sessionId = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Restore from LocalStorage on mount
  useEffect(() => {
    let storedSession = localStorage.getItem("omni_session_id");
    if (!storedSession) {
      storedSession = `session-${Math.random().toString(36).substring(7)}`;
      localStorage.setItem("omni_session_id", storedSession);
    }
    sessionId.current = storedSession;

    const storedMessages = localStorage.getItem("omni_messages");
    if (storedMessages) setMessages(JSON.parse(storedMessages));

    const storedCart = localStorage.getItem("omni_cart");
    if (storedCart) setCart(JSON.parse(storedCart));

    const storedAudit = localStorage.getItem("omni_audit_log");
    if (storedAudit) setAuditLog(JSON.parse(storedAudit));

    setIsHydrated(true);
  }, []);

  // 2. Persist to LocalStorage whenever state changes
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("omni_messages", JSON.stringify(messages));
      localStorage.setItem("omni_cart", JSON.stringify(cart));
      localStorage.setItem("omni_audit_log", JSON.stringify(auditLog));
    }
  }, [messages, cart, auditLog, isHydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, auditLog]);

  const toggleNode = (idx: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          cart,
          sessionId: sessionId.current
        }),
      });
      
      const data = await res.json();
      
      if (data.message) {
        setMessages(prev => {
          const newMessages = [...prev];
          // We assume the last message is the one we want to append UI to if the backend returned it with this turn
          // Alternatively, we just add the UI to the message we append:
          return [...newMessages, { role: data.message.role, content: data.message.content, ui: data.ui }];
        });
      }
      if (data.cart) {
        setCart(data.cart);
      }
      if (data.auditLog && data.auditLog.length > 0) {
        setAuditLog(prev => [...prev, ...data.auditLog]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFromUI = (productId: string) => {
    setInput(`Add 1 ${productId} to my cart`);
    // Ideally we would trigger sendMessage directly but setting input is a start. 
    // To trigger directly, we can wrap sendMessage logic, but for now we'll do it manually by forcing a submit.
    setTimeout(() => {
      const form = document.getElementById("chat-form") as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 100);
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Left Pane - Chat */}
      <div className={`${isAuditTrailOpen ? 'w-1/2' : 'w-full'} flex flex-col border-r border-gray-200 bg-white transition-all duration-300`}>
        <header className="p-4 border-b border-gray-200 bg-gray-50 shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">OMNI.AI</h1>
            <p className="text-sm text-gray-500">Ask for products, add to cart, and checkout.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded hover:bg-red-100 transition-colors"
            >
              Reset Session
            </button>
            {!isAuditTrailOpen && (
              <button 
                onClick={() => setIsAuditTrailOpen(true)}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded hover:bg-gray-700 transition-colors"
              >
                Audit Trail
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-gray-50">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 pt-20">
              <div className="w-32 h-32 mb-4 animate-bounce">
                <img src="/avatar_clean.png" alt="OMNI.AI Mascot" className="w-full h-full object-contain drop-shadow-2xl" />
              </div>
              <p className="text-lg text-gray-500 font-medium">Hello! I am OMNI.AI.</p>
              <p className="text-sm">Start by typing, e.g. "I want to buy running shoes."</p>
            </div>
          )}
          {messages.map((m, idx) => (
              <div key={idx} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                {m.role === 'assistant' && (
                  <div className="flex-shrink-0 mr-3 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr from-blue-100 to-indigo-50 border border-blue-200 shadow-sm flex items-center justify-center mt-1">
                    <img src="/avatar_clean.png" alt="OMNI.AI" className="w-full h-full object-cover object-top scale-110" />
                  </div>
                )}
                <div className={`max-w-[80%] p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none shadow-sm' : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-none'}`}>
                  {m.role === 'user' ? (
                    <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  ) : (
                    <div className="text-sm markdown-body prose prose-sm max-w-none">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                      {m.ui && m.ui.map((component, cidx) => {
                        if (component.type === 'product_carousel') {
                          return (
                            <div key={cidx} className="flex gap-4 overflow-x-auto py-4 mt-2">
                            {component.items.map((prod: any) => (
                              <div key={prod.id} className="flex-shrink-0 w-48 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                                <div className="h-32 bg-gray-100 relative">
                                  {prod.image_url ? (
                                    <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                                  )}
                                </div>
                                <div className="p-3 flex-1 flex flex-col">
                                  <h4 className="font-bold text-xs text-gray-900 truncate">{prod.name}</h4>
                                  <p className="text-blue-600 font-semibold text-sm mt-1">₹{prod.price}</p>
                                  <button 
                                    onClick={() => handleAddFromUI(prod.id)}
                                    className="mt-auto w-full py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-700 transition-colors"
                                  >
                                    Add to Cart
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      } else if (component.type === 'cart_summary') {
                        return (
                          <div key={cidx} className="mt-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm w-full max-w-sm">
                            <h4 className="font-bold text-gray-900 mb-3 border-b pb-2">Your Cart</h4>
                            {component.summary.items.length === 0 ? (
                              <p className="text-sm text-gray-500">Cart is empty.</p>
                            ) : (
                              <div className="space-y-3">
                                {component.summary.items.map((item: any) => (
                                  <div key={item.id} className="flex justify-between items-center">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-800">{item.name}</p>
                                      <p className="text-xs text-gray-500">Qty: {item.quantity} × ₹{item.price_per_unit}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-gray-900">₹{item.subtotal}</span>
                                      <button 
                                        onClick={() => {
                                          setInput(`Remove ${item.id} from my cart`);
                                          setTimeout(() => {
                                            const form = document.getElementById("chat-form") as HTMLFormElement;
                                            if (form) form.requestSubmit();
                                          }, 100);
                                        }}
                                        className="text-red-500 hover:text-red-700 p-1"
                                        title="Remove item"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center">
                                  <span className="font-bold text-gray-900">Subtotal</span>
                                  <span className="font-bold text-xl text-gray-900">₹{component.summary.total}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } else if (component.type === 'payment_card') {
                        return (
                          <div key={cidx} className="mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 shadow-lg text-white w-full max-w-sm flex flex-col items-center">
                            <div className="bg-white/20 p-3 rounded-full mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line></svg>
                            </div>
                            <h4 className="font-semibold text-lg mb-1">Order Approved</h4>
                            <p className="text-blue-100 text-sm mb-4">Amount Due: ₹{component.amount}</p>
                            <a 
                              href={component.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-full text-center py-2.5 bg-white text-indigo-600 font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                            >
                              Pay Now (Razorpay)
                            </a>
                            <p className="text-xs text-blue-200 mt-3 text-center">Secure SSL Checkout</p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-3 rounded-lg text-sm text-gray-500">
                Agent is thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 p-4 md:p-6 bg-white border-t border-gray-100 z-10">
          <form id="chat-form" onSubmit={sendMessage} className="relative max-w-4xl mx-auto flex items-end shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-gray-200 rounded-2xl bg-white transition-shadow focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <textarea 
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isLoading) {
                    const form = e.currentTarget.form;
                    if (form) form.requestSubmit();
                    // Reset height after submit
                    e.currentTarget.style.height = 'auto';
                  }
                }
              }}
              placeholder="Message the agent..."
              rows={1}
              style={{ minHeight: '56px' }}
              className="flex-1 py-4 pl-6 pr-16 bg-transparent outline-none text-gray-800 placeholder-gray-400 rounded-2xl text-base resize-none overflow-y-auto leading-relaxed"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="absolute right-2 bottom-2 p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-300 transition-colors"
              title="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Right Pane - Audit Log */}
      {isAuditTrailOpen && (
      <div className="w-1/2 flex flex-col bg-gray-900 text-gray-100 transition-all duration-300">
        <header className="p-4 border-b border-gray-700 bg-gray-800 shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold font-mono">Live Audit Trail</h1>
            <span className="text-xs text-gray-400 font-mono">Explainable. Bounded. Gated.</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-700 rounded-md p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs font-mono rounded ${viewMode === 'list' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1 text-xs font-mono rounded ${viewMode === 'flow' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Flow View
              </button>
            </div>
            <button 
              onClick={() => setIsAuditTrailOpen(false)}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
              title="Close Audit Trail"
            >
              <XCircle size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
          {auditLog.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
              No actions recorded yet.
            </div>
          )}

          {viewMode === 'list' && auditLog.map((log, idx) => {
            let color = "border-blue-500 text-blue-400";
            let bg = "bg-gray-800";
            if (log.status === "blocked") {
              color = "border-yellow-500 text-yellow-400";
              bg = "bg-yellow-900/20";
            } else if (log.status === "failed") {
              color = "border-red-500 text-red-400";
              bg = "bg-red-900/20";
            } else if (log.status === "success") {
              color = "border-green-500 text-green-400";
            }

            return (
              <div key={idx} className={`p-3 border-l-4 rounded ${color} ${bg} shadow-sm`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm">{log.action}</span>
                  <span className="text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-gray-300 italic mb-2">"{log.reasoning}"</div>
                
                {log.status === "blocked" && (
                  <div className="text-yellow-300 bg-yellow-900/40 p-2 rounded mt-1 break-all">
                    BLOCK REASON: {log.result?.reason || "Guardrail triggered"}
                  </div>
                )}
                
                {log.status === "failed" && (
                  <div className="text-red-300 bg-red-900/40 p-2 rounded mt-1 break-all">
                    ERROR: {log.result?.error || log.result?.reason || "Action failed"}
                  </div>
                )}

                {log.status === "success" && log.action === "create_payment_order" && (
                  <div className="text-green-300 bg-green-900/40 p-2 rounded mt-1 break-all">
                    ORDER CREATED: {log.result?.id} (Amount: ₹{log.result?.amount / 100})
                  </div>
                )}
              </div>
            );
          })}

          {viewMode === 'flow' && (
            <div className="relative flex flex-col items-center py-6 space-y-12">
              {auditLog.length > 0 && (
                <div className="absolute left-1/2 top-10 bottom-10 w-0.5 bg-gray-600 -translate-x-1/2 z-0"></div>
              )}
              {auditLog.map((log, idx) => {
                let Icon = CheckCircle;
                let colorClass = "text-green-400";
                let borderColor = "border-green-500";
                
                if (log.status === "blocked") {
                  Icon = ShieldAlert;
                  colorClass = "text-yellow-400";
                  borderColor = "border-yellow-500";
                } else if (log.status === "failed") {
                  Icon = XCircle;
                  colorClass = "text-red-400";
                  borderColor = "border-red-500";
                } else {
                  if (log.action === "search_catalog") Icon = Search;
                  else if (log.action.includes("cart")) Icon = ShoppingCart;
                  else if (log.action.includes("payment")) Icon = CreditCard;
                }
                
                const isExpanded = expandedNodes.has(idx);
                const isEven = idx % 2 === 0;
                
                return (
                  <div key={idx} className={`relative flex items-center w-full ${isEven ? 'justify-end pr-[50%]' : 'justify-start pl-[50%]'}`}>
                    
                    {/* Node Icon on Center Line */}
                    <div 
                      className={`absolute left-1/2 -translate-x-1/2 p-2 rounded-full bg-gray-900 ${colorClass} border-2 ${borderColor} z-10 shadow-lg cursor-pointer hover:scale-110 transition-transform`}
                      onClick={() => toggleNode(idx)}
                      title="Click to expand details"
                    >
                      <Icon size={20} />
                    </div>
                    
                    {/* Minimal Label Box */}
                    <div className={`w-11/12 max-w-[200px] mx-8 p-3 rounded bg-gray-800 border-t-2 ${borderColor} shadow-md`}>
                      <div className={`font-bold text-sm ${colorClass} text-center`}>{log.action}</div>
                      
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-700 text-xs overflow-x-auto">
                          <pre className="text-gray-400 whitespace-pre-wrap">{JSON.stringify(log.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
