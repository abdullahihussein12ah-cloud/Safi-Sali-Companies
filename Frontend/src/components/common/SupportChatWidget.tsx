import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, ShieldCheck, UserRound, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Logo } from '../brand/Logo';

type ChatLanguage = 'en' | 'so';
type ChatMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
};

const companyAnswers: Record<string, (language: ChatLanguage) => string> = {
  welcome: (language) => language === 'so'
    ? 'Ku soo dhawoow Safi Sali Companies! Iga weydii shirkadda, adeegyada tiknoolajiyadda, ama sida nidaamka ganacsigu u shaqeeyo. Maxaan kuu sharxaa?'
    : 'Welcome to Safi Sali Companies! Ask me about the company, its technology services, or how the business system works. What can I explain?',
  company: (language) => language === 'so'
    ? 'Safi Sali Companies waa shirkad tiknoolajiyadeed oo ganacsiyada iyo hay’adaha ka caawisa inay koraan oo si hufan u shaqeeyaan. Waxay bixisaa samaynta software iyo website-yo, nidaamyada maamulka ganacsiga, barnaamijyada moobilka, la-talinta iyo taageerada IT-ga, iyo xalalka isbeddelka dhijitaalka ah. Nidaamka maamulka ganacsigu wuxuu ka kooban yahay POS, alaab iyo kayd, macaamiil iyo deyn, alaab-qeybiyeyaal iyo iibsiyo, shaqaale, xisaabaad iyo warbixinno.'
    : 'Safi Sali Companies is a technology company that helps businesses and organizations work efficiently and grow. Its services include custom software and website development, business-management systems, mobile applications, IT consulting and support, and digital-transformation solutions. The business-management system includes POS, products and inventory, customers and debts, suppliers and purchases, staff, accounting, and reports.',
  businessManagement: (language) => language === 'so'
    ? 'Nidaamka maamulka ganacsiga ee Safi Sali Companies wuxuu hal meel kuugu suurtageliyaa inaad maamusho iibka POS iyo rasiidhada, alaabta iyo tirada kaydka, digniinaha kayd-yar, macaamiisha iyo deymaha, alaab-qeybiyeyaasha iyo iibsiyada, shaqaalaha, xaadirinta, fasaxyada, mushaharka, xisaabaadka iyo warbixinnada. Waxa aad isticmaali karto waxay ku xiran yihiin doorkaaga iyo qorshaha akoonka.'
    : 'Safi Sali Companies’ business-management system brings together POS sales and receipts, products and stock quantities, low-stock alerts, customers and debts, suppliers and purchases, staff, attendance, leave, payroll, accounting, and reports. Available features depend on your account role and plan.',
  services: (language) => language === 'so'
    ? 'Adeegyada Safi Sali Companies waxaa ka mid ah:\n1. Samaynta software ku habboon baahida ganacsiga.\n2. Samaynta website-yo casri ah oo qalab kala duwan la jaanqaada.\n3. Nidaamyada maamulka ganacsiga: POS, alaab, kayd, macaamiil, shaqaale iyo mushahar.\n4. Samaynta barnaamijyada moobilka.\n5. La-talinta, dayactirka nidaamyada iyo taageerada IT-ga.\n6. Ka caawinta ganacsiyada inay hawlaha gacanta ugu beddelaan xalal dhijitaal ah.\n\nNidaamka dukaanka waxa kale oo ku jira QR/barcode, deymaha, iibsiyada, xisaabaadka, warbixinnada iyo taageerada lacagaha kala duwan.'
    : 'Safi Sali Companies’ services include:\n1. Custom software development for business needs.\n2. Modern, responsive website development.\n3. Business-management systems for POS, products, inventory, customers, staff, and payroll.\n4. Mobile application development.\n5. IT consulting, system maintenance, and technical support.\n6. Digital-transformation solutions to replace manual workflows.\n\nThe retail system also includes QR/barcode tools, debts, purchases, accounting, reports, and multi-currency support.',
  howto: (language) => language === 'so'
    ? 'Si aad u bilowdo: marka hore geli alaabta, qiimaha, tirada kaydka iyo xadka digniinta. Kadib POS-ka ka diiwaangeli iibka; qaybaha Customers, Suppliers iyo Reports-na u isticmaal dabagalka iyo warbixinnada. Qaybaha aad arki karto waxay ku xiran yihiin doorka akoonkaaga.'
    : 'To get started, add products with their prices, stock quantities, and low-stock thresholds. Then record sales in POS; use Customers, Suppliers, and Reports for follow-up and summaries. Available sections depend on your account role.',
  pricing: (language) => language === 'so'
    ? 'Nidaamku wuxuu leeyahay tijaabo bilaash ah oo 365 maalmood ah iyo qorshayaal kala duwan. Qiimaha iyo xaddidaadaha hadda jira ka eeg bogga “Choose Your Plan” ee app-ka; faahfaahin aan halkaas ku xaqiijin waayo ma qiyaasayo.'
    : 'The software offers a 365-day free trial and several plans. Check the app’s “Choose Your Plan” page for current prices and limits; I won’t guess at details I can’t verify.',
  privacy: (language) => language === 'so'
    ? 'Amniga iyo asturnaanta awgood, ma bixin karo xog qofeed, lambarro telefoon oo gaar ah, aqoonsi, furayaal sir ah, xog macaamiil ama shaqaale, xog maaliyadeed oo qarsoodi ah, ama xog shirkadeed oo xaddidan.'
    : 'For security and privacy reasons, I cannot provide personal information, phone numbers, identification numbers, passwords, customer or employee data, sensitive financial details, or confidential company information.',
  fallback: (language) => language === 'so'
    ? 'Safi Sali Companies waxay bixisaa xalal tiknoolajiyadeed oo ganacsiyada ka caawiya hawlgal hufan: software iyo website-yo, nidaamyada maamulka ganacsiga, barnaamijyada moobilka, taageerada IT-ga iyo isbeddelka dhijitaalka ah. Nidaamka ganacsigu wuxuu daboolaa iibka, alaabta iyo kaydka, macaamiisha, iibsiyada, shaqaalaha, xisaabaadka iyo warbixinnada. Faahfaahinta adeeg gaar ah ama helitaankiisa kala xiriir qofka taageerada ah.'
    : 'Safi Sali Companies provides technology solutions that help businesses operate efficiently: software and websites, business-management systems, mobile apps, IT support, and digital transformation. The business system covers sales, products and inventory, customers, purchases, staff, accounting, and reports. Contact a support person for details about a specific service or its availability.',
};

const somaliWords = /\b(waa|maxay|maxaa|maxey|muxuu|muxay|muxey|shirkad|shirkadda|adeeg|adeegyada|sidee|sida|maareyn|maareynta|ganacsi|ganacsiga|bilaash|qiimo|lacag|xog|alaab|kaydk|macaamiil|deyn|iib|iibsasho|shaqaale|salaan|mahadsanid|fadlan|waxay|waxa|ku saabsan|qabta|qabataa|qabtaa|bixisaa)\b/i;
const privacyWords = /\b(password|passcode|credential|credentials|private|confidential|secret|api key|token|customer data|employee data|banking|furaha sirta|furaha|aqoonsi|lambar aqoonsi|xog gaar ah|xog qarsoodi|xogta macaamiisha|xogta shaqaalaha|xog maaliyadeed|koonto bangi|furaha bangiga)\b/i;

const getChatLanguage = (text: string, defaultLanguage: ChatLanguage): ChatLanguage =>
  somaliWords.test(text) ? 'so' : /\b(the|what|how|does|do|is|are|can|company|services|price|free|business|help|please|thank)\b/i.test(text)
    ? 'en'
    : defaultLanguage;

const getCompanyAnswer = (question: string, language: ChatLanguage): string => {
  const normalizedQuestion = question.toLocaleLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (privacyWords.test(normalizedQuestion)) return companyAnswers.privacy(language);
  if (
    /\b(what does|what is|who is|about|company|shirkad|shirkadda|safi sali|shirkadee)\b/.test(normalizedQuestion) ||
    /\b(max(?:ay|ey|aa)|waa maxay)\b.*\b(qaba(?:taa|ta)|qabtaa|shirkad|shirkadda|safi sali|tahay)\b/.test(normalizedQuestion) ||
    /\b(qaba(?:taa|ta)|qabtaa)\b.*\b(maxay|maxey|shirkad|shirkadda|safi sali)\b/.test(normalizedQuestion)
  ) return companyAnswers.company(language);
  if (/\b(business management|manage a business|maamulka ganacsiga|maareynta ganacsiga|nidaamka ganacsiga|ganacsi u maamulo)\b/.test(normalizedQuestion)) {
    return companyAnswers.businessManagement(language);
  }
  if (/\b(service|services|feature|features|offer|provide|adeeg|adeegyada|waxyaabaha|qaybaha|system|nidaam|bixisaa|bixiso)\b/.test(normalizedQuestion)) {
    return companyAnswers.services(language);
  }
  if (/\b(how|start|setup|manage|create|make|sidee|bilow|bilaab|sameey|maareey|maareyn)\b/.test(normalizedQuestion)) {
    return companyAnswers.howto(language);
  }
  if (/\b(free|price|pricing|cost|plan|trial|bilaash|qiimo|lacag|qorshe|tijaabo)\b/.test(normalizedQuestion)) {
    return companyAnswers.pricing(language);
  }
  return companyAnswers.fallback(language);
};

const suggestedQuestions: Record<ChatLanguage, string[]> = {
  en: [
    'What does Safi Sali Companies do?',
    'What services does the software offer?',
    'Is there a free trial?',
  ],
  so: [
    'Maxay qabataa Safi Sali Companies?',
    'Adeegyada nidaamku muxuu ka kooban yahay?',
    'Tijaabo bilaash ah ma jiraa?',
  ],
};

export const SupportChatWidget: React.FC = () => {
  const { language: appLanguage } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLanguage, setChatLanguage] = useState<ChatLanguage>(appLanguage);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
    inputRef.current?.focus();
  }, [isOpen, messages]);

  const startChat = () => {
    if (messages.length === 0) {
      const initialLanguage: ChatLanguage = appLanguage === 'so' ? 'so' : 'en';
      setChatLanguage(initialLanguage);
      setMessages([{ id: Date.now(), role: 'assistant', text: companyAnswers.welcome(initialLanguage) }]);
    }
    setIsOpen(true);
  };

  const sendQuestion = (rawQuestion = question) => {
    const text = rawQuestion.trim();
    if (!text) return;
    const nextLanguage = getChatLanguage(text, chatLanguage);
    setChatLanguage(nextLanguage);
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', text },
      { id: Date.now() + 1, role: 'assistant', text: getCompanyAnswer(text, nextLanguage) },
    ]);
    setQuestion('');
  };

  const isSomali = chatLanguage === 'so';

  return (
    <>
      {isOpen && (
        <section
          aria-label={isSomali ? 'Caawinta Safi Sali Companies' : 'Safi Sali Companies Help'}
          className="safi-support-chat-panel fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex max-h-[min(680px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 dark:border-slate-700 dark:bg-slate-900 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[min(400px,calc(100vw-2rem))]"
        >
          <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex h-12 min-w-0 flex-1 items-center rounded-xl bg-white px-2 shadow-xs dark:bg-white">
              <Logo size="md" className="!h-10 !w-auto max-w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                Safi Sali Companies Help
              </p>
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {isSomali
                  ? 'Weydii su’aal. Qof taageero ah ayaad la xiriiri kartaa.'
                  : 'Ask a question. A real person can join if you need one.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={isSomali ? 'Xir sheekaysiga' : 'Close chat'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div
            ref={messageListRef}
            aria-live="polite"
            className="min-h-40 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 dark:bg-slate-950/40"
          >
            {messages.map((message) => (
              <div key={message.id} className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <p className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-emerald-600 text-white'
                    : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}>
                  {message.text}
                </p>
                {message.role === 'user' && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    <UserRound className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}

            {messages.length === 1 && (
              <div className="space-y-2 pl-9 pt-1">
                {suggestedQuestions[chatLanguage].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendQuestion(suggestion)}
                    className="block max-w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left text-[11px] font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendQuestion();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={isSomali ? 'Su’aashaada qor...' : 'Write your question...'}
                aria-label={isSomali ? 'Qor su’aashaada' : 'Write your question'}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={!question.trim()}
                aria-label={isSomali ? 'Dir su’aasha' : 'Send question'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <a
              href="https://wa.me/252683723015"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              <MessageCircle className="h-4 w-4" />
              {isSomali ? 'La hadal qof taageero ah' : 'Talk to a person'}
            </a>

            <p className="flex items-start justify-center gap-1.5 px-1 text-center text-[10px] leading-relaxed text-slate-400">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              {isSomali
                ? 'Kaaliyahani wuxuu adeegsadaa jawaabo xogta shirkadda ku kooban. Ha wadaagin furaha sirta ama lambarka aqoonsiga. Fariimaha halkan laguma kaydiyo.'
                : 'This helper uses company-information answers only. Never share a password or ID number. Messages are not stored here.'}
            </p>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={isOpen ? () => setIsOpen(false) : startChat}
        aria-label={isOpen ? (isSomali ? 'Xir caawinta' : 'Close help') : 'Chat with Us'}
        aria-expanded={isOpen}
        className="safi-support-chat-toggle fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[70] inline-flex h-10 w-10 min-h-10 items-center justify-center rounded-full bg-emerald-600 p-0 text-xs font-extrabold text-white shadow-xl shadow-emerald-900/25 transition hover:-translate-y-0.5 hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 sm:right-6 sm:h-auto sm:w-auto sm:min-h-12 sm:gap-2 sm:px-4 sm:py-0"
      >
        {isOpen ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        <span className="hidden sm:inline">
          {isOpen ? (isSomali ? 'Xir' : 'Close') : (isSomali ? 'Nala sheekayso' : 'Chat with Us')}
        </span>
      </button>
    </>
  );
};
