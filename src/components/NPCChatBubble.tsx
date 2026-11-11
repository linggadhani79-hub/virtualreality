import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, X } from "lucide-react";

interface NPCChatBubbleProps {
  objectName: string;
  knowledge: string;
  onClose: () => void;
}

export function NPCChatBubble({ objectName, knowledge, onClose }: NPCChatBubbleProps) {
  const [messages, setMessages] = useState<{role: "user" | "npc", content: string}[]>([
    { role: "npc", content: `Halo! Saya adalah NPC untuk ${objectName}. Ada yang ingin didiskusikan?` }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");

    // Simple static bot logic (simulating typing delay)
    setTimeout(() => {
      let reply = "Maaf, saya tidak mengerti. Tidak ada informasi yang cocok.";
      const lowerInput = userMsg.toLowerCase();
      
      const lines = knowledge.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Try to parse Q&A pairs (e.g., T: ... J: ...)
      const qaPairs: {q: string, a: string}[] = [];
      let currentQ = "";
      let currentA = "";
      
      for (const line of lines) {
        if (line.toLowerCase().startsWith('t:') || line.toLowerCase().startsWith('q:')) {
          if (currentQ) {
             qaPairs.push({q: currentQ, a: currentA});
          }
          currentQ = line.substring(2).trim();
          currentA = "";
        } else if (line.toLowerCase().startsWith('j:') || line.toLowerCase().startsWith('a:')) {
          currentA += (currentA ? "\n" : "") + line.substring(2).trim();
        } else {
          if (currentQ) {
            currentA += (currentA ? "\n" : "") + line;
          }
        }
      }
      if (currentQ) {
        qaPairs.push({q: currentQ, a: currentA});
      }

      const words = lowerInput.split(/\s+/).filter(w => w.length > 2);

      if (qaPairs.length > 0) {
        let bestQScore = 0;
        let bestQA = null;
        
        for (const pair of qaPairs) {
           let score = 0;
           const lowerQ = pair.q.toLowerCase();
           for (const w of words) {
             if (lowerQ.includes(w)) score++;
           }
           if (score > bestQScore) {
             bestQScore = score;
             bestQA = pair;
           }
        }
        
        if (bestQA && bestQScore > 0) {
          reply = bestQA.a;
        } else if (words.length === 0 && qaPairs.length > 0) {
          reply = "Anda bisa bertanya seperti: " + qaPairs[0].q;
        } else {
          reply = "Maaf, saya tidak tahu. Pertanyaan Anda tidak ada dalam informasi saya.";
        }
      } else if (lines.length > 0) {
        // Fallback to simple keyword matching on lines if not formatted as Q&A
        let maxScore = 0;
        let bestMatch = "";

        for (const line of lines) {
          let score = 0;
          const lowerLine = line.toLowerCase();
          for (const w of words) {
            if (lowerLine.includes(w)) {
              score++;
            }
          }
          if (score > maxScore) {
            maxScore = score;
            bestMatch = line;
          }
        }

        if (maxScore > 0 && bestMatch) {
          reply = bestMatch;
        } else {
          // If no keywords matched, just pick a random line or say I don't know
          reply = "Info yang saya tahu: " + lines[Math.floor(Math.random() * lines.length)];
        }
      } else {
        reply = "Belum ada informasi yang diunggah untuk objek ini. Anda bisa menambahkannya di Panel Kontrol Objek.";
      }

      setMessages(prev => [...prev, { role: "npc", content: reply }]);
    }, 600);
  };

  return (
    <div className="bg-neutral-900/95 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl w-64 flex flex-col h-[300px] overflow-hidden pointer-events-auto mt-2">
      {/* Header */}
      <div className="flex items-center justify-between p-2.5 border-b border-white/10 bg-neutral-900">
        <div className="flex items-center gap-2 text-white">
          <Bot className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider truncate max-w-[150px]">NPC {objectName}</h3>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-xs">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`px-3 py-2 rounded-xl max-w-[85%] whitespace-pre-wrap ${
              msg.role === "user" 
                ? "bg-emerald-600 text-white rounded-tr-none shadow-md" 
                : "bg-neutral-800 text-neutral-200 border border-white/10 rounded-tl-none shadow-md"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-white/10 bg-neutral-900/50">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Tanya NPC..."
            className="flex-1 bg-neutral-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white p-1.5 rounded-lg flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
