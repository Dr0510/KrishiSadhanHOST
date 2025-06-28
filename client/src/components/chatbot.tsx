import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, X, Loader2, MinimizeIcon, Lightbulb, Phone, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Message {
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export function Chatbot() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      content: t('chatbot.welcome', "Hello! How can I help you with farm equipment rental today?"),
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickSuggestions = [
    t('chatbot.suggestions.findEquipment', 'Find equipment for my farm'),
    t('chatbot.suggestions.bookingProcess', 'How do I book equipment?'),
    t('chatbot.suggestions.pricing', 'What are the rental prices?'),
    t('chatbot.suggestions.availability', 'Check equipment availability'),
    'Contact via WhatsApp',
    'Share equipment list'
  ];

  // WhatsApp integration function
  const sendToWhatsApp = (message: string) => {
    const phoneNumber = "919876543210"; // Replace with actual support number
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Share equipment information
  const shareEquipmentInfo = async (addMessageFn: (content: string, sender: 'user' | 'bot') => void) => {
    try {
      const response = await fetch('/api/equipment');
      const equipment = await response.json();
      const topEquipment = equipment.slice(0, 5);
      
      const shareText = `🚜 Farm Equipment Available for Rent:\n\n${topEquipment.map((eq: any) => 
        `• ${eq.name} - ₹${eq.pricePerDay}/day`
      ).join('\n')}\n\nBook now: ${window.location.origin}`;
      
      if (navigator.share) {
        await navigator.share({
          title: 'Farm Equipment Rental',
          text: shareText,
        });
        addMessageFn('Equipment list shared successfully!', 'bot');
      } else {
        navigator.clipboard.writeText(shareText);
        addMessageFn('Equipment list copied to clipboard! You can now paste it anywhere to share.', 'bot');
      }
    } catch (error) {
      console.error('Share error:', error);
      addMessageFn('Sorry, there was an error sharing the equipment list. Please try again.', 'bot');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchGeminiResponse = async (userMessage: string) => {
    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Error fetching Gemini response:', error);
      throw error;
    }
  };

  const addMessage = (content: string, sender: 'user' | 'bot') => {
    const message: Message = {
      content,
      sender,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
  };

  const handleSubmit = async (e?: React.FormEvent, customMessage?: string) => {
    e?.preventDefault();
    const messageToSend = customMessage || input;
    if (!messageToSend.trim()) return;

    // Hide suggestions after first interaction
    setShowSuggestions(false);

    // Handle special commands
    if (messageToSend.toLowerCase().includes('whatsapp') || messageToSend === 'Contact via WhatsApp') {
      addMessage(messageToSend, 'user');
      setInput("");
      
      const whatsappMessage = "Hello! I need help with farm equipment rental. Can you assist me?";
      sendToWhatsApp(whatsappMessage);
      addMessage("I've opened WhatsApp for you to contact our support team directly. You can send them your questions about equipment rental!", 'bot');
      return;
    }

    if (messageToSend === 'Share equipment list') {
      addMessage(messageToSend, 'user');
      setInput("");
      await shareEquipmentInfo(addMessage);
      return;
    }

    // Add user message
    addMessage(messageToSend, 'user');
    setInput("");
    setIsTyping(true);

    try {
      // Get response from Gemini
      const response = await fetchGeminiResponse(messageToSend);
      addMessage(response, 'bot');
    } catch (error) {
      console.error('Chat error:', error);
      // Add error message to chat
      const errorMessage: Message = {
        content: t('chatbot.error', "I'm sorry, but I'm having trouble connecting right now. Please try again later or contact our support team for immediate assistance."),
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSubmit(undefined, suggestion);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 rounded-full w-12 h-12 shadow-lg"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 h-[500px] shadow-2xl flex flex-col border-2 border-primary/20">
      <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h3 className="font-semibold">{t('chatbot.title', 'Farm Equipment Assistant')}</h3>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-white/20"
            onClick={() => setIsOpen(false)}
          >
            <MinimizeIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-white/20"
            onClick={() => {
              setMessages([{
                content: t('chatbot.welcome', "Hello! How can I help you with farm equipment rental today?"),
                sender: 'bot',
                timestamp: new Date()
              }]);
              setShowSuggestions(true);
              setIsOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl p-3 shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted border rounded-bl-sm'
                }`}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </div>
                <div className={`text-xs mt-1 opacity-70 ${
                  message.sender === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          
          {/* Quick suggestions - only show initially */}
          {showSuggestions && messages.length === 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4" />
                <span>{t('chatbot.quickHelp', 'Quick Help')}</span>
              </div>
              <div className="grid gap-2">
                {quickSuggestions.map((suggestion, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="text-left h-auto p-3 justify-start hover:bg-primary/5"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <span className="text-xs leading-relaxed">{suggestion}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl p-3 bg-muted border rounded-bl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    {t('chatbot.typing', 'Assistant is typing...')}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/30">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chatbot.inputPlaceholder', 'Type your message...')}
              className="flex-1 rounded-lg"
              disabled={isTyping}
            />
            <Button type="submit" size="icon" disabled={isTyping || !input.trim()} className="rounded-lg">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {t('chatbot.helpText', 'I can help you with equipment rentals, pricing, availability, and booking assistance.')}
          </div>
        </form>
      </div>
    </Card>
  );
}