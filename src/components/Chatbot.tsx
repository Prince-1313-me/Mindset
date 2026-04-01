import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, User, Phone, Mail, HelpCircle, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getChatResponse } from '../services/geminiService';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

interface ChatbotProps {
  isLoggedIn: boolean;
  userName?: string | null;
}

export const Chatbot: React.FC<ChatbotProps> = ({ isLoggedIn, userName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'initial' | 'help' | 'contact' | 'success' | 'chat'>('initial');
  const [contactInfo, setContactInfo] = useState({ phone: '', email: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const resetChat = () => {
    setStep('initial');
    setContactInfo({ phone: '', email: '' });
    setMessages([]);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contactInfo.phone || contactInfo.email) {
      setStep('success');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    const response = await getChatResponse(userMsg, userName);
    setMessages(prev => [...prev, { role: 'bot', content: response }]);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-24 md:bottom-8 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-16 right-0 w-80 md:w-96 bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col"
            style={{ height: '500px' }}
          >
            {/* Header */}
            <div className="bg-neutral-900 dark:bg-neutral-100 p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white dark:bg-neutral-900 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-neutral-900 dark:text-white" />
                </div>
                <span className="font-bold text-white dark:text-neutral-900">Prince Chatbot</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white dark:hover:text-neutral-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
              {step !== 'chat' && (
                <>
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm">
                    Hello! I'm Prince Chatbot. How can I assist you today?
                  </div>

                  {isLoggedIn ? (
                    <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm">
                      I see you're logged in as <span className="font-bold">{userName || 'Prîñçé Shármá'}</span>. Great to have you back!
                    </div>
                  ) : (
                    <div className="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 p-3 rounded-2xl rounded-tl-none text-sm border border-orange-100 dark:border-orange-900/50">
                      You are currently not logged in. Please sign in to save your progress and streaks!
                    </div>
                  )}
                </>
              )}

              {step === 'initial' && (
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <button 
                    onClick={() => setStep('chat')}
                    className="flex items-center gap-2 p-3 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 transition-opacity text-sm text-left font-bold"
                  >
                    <Sparkles className="w-4 h-4" />
                    Chat with AI Assistant
                  </button>
                  <button 
                    onClick={() => setStep('help')}
                    className="flex items-center gap-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-sm text-left"
                  >
                    <HelpCircle className="w-4 h-4 text-blue-500" />
                    How to manage the website?
                  </button>
                  <button 
                    onClick={() => setStep('contact')}
                    className="flex items-center gap-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-sm text-left"
                  >
                    <User className="w-4 h-4 text-green-500" />
                    Connect with us
                  </button>
                </div>
              )}

              {step === 'chat' && (
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm">
                      Ask me anything about your productivity, mindset, or how to use this app!
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "p-3 rounded-2xl text-sm max-w-[85%]",
                        msg.role === 'user' 
                          ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 ml-auto rounded-tr-none" 
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-tl-none"
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                  {isTyping && (
                    <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm w-fit flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Thinking...
                    </div>
                  )}
                </div>
              )}

              {step === 'help' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm">
                    <p className="font-bold mb-1">Managing Mindset:</p>
                    <ul className="list-disc list-inside space-y-1 opacity-80">
                      <li><strong>Today:</strong> Add and complete your daily tasks.</li>
                      <li><strong>Routines:</strong> Apply pre-defined routines to build habits quickly.</li>
                      <li><strong>Stats:</strong> Track your streaks and screen time trends.</li>
                      <li><strong>AI Coach:</strong> Complete your day to get personalized feedback.</li>
                    </ul>
                  </div>
                  <button 
                    onClick={() => setStep('initial')}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Back to options
                  </button>
                </div>
              )}

              {step === 'contact' && (
                <form onSubmit={handleContactSubmit} className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-none text-sm">
                    Please provide your details and we'll get back to you!
                  </div>
                  <div className="space-y-2">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input 
                        type="tel" 
                        placeholder="Phone Number"
                        value={contactInfo.phone}
                        onChange={(e) => setContactInfo({...contactInfo, phone: e.target.value})}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input 
                        type="email" 
                        placeholder="Email Address"
                        value={contactInfo.email}
                        onChange={(e) => setContactInfo({...contactInfo, email: e.target.value})}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                  >
                    Submit Details
                  </button>
                  <button 
                    type="button"
                    onClick={() => setStep('initial')}
                    className="w-full text-xs text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                </form>
              )}

              {step === 'success' && (
                <div className="text-center space-y-4 py-4 animate-in zoom-in">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold">Thank you!</p>
                    <p className="text-sm text-neutral-500">We've received your contact info.</p>
                  </div>
                  <button 
                    onClick={resetChat}
                    className="text-sm font-medium text-neutral-900 dark:text-white hover:underline"
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>

            {/* Input for AI Chat */}
            {step === 'chat' && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 shrink-0">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border-none text-sm focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                  />
                  <button 
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="w-10 h-10 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl flex items-center justify-center disabled:opacity-50 transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <button 
                  onClick={() => setStep('initial')}
                  className="w-full text-[10px] text-neutral-500 mt-2 hover:underline"
                >
                  Back to main menu
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-full shadow-xl flex items-center justify-center transition-transform"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
};
