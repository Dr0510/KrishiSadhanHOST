import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { useTranslation } from "react-i18next";

type VoiceCommandHandler = (command: string) => void;

interface UseVoiceAssistantProps {
  onCommand: VoiceCommandHandler;
  language?: string;
}

const COMMAND_THRESHOLD = 0.8;
const NO_SPEECH_TIMEOUT = 10000;
const SPEECH_DEBOUNCE_MS = 300;

export function useVoiceAssistant({
  onCommand,
  language = "en-US",
}: UseVoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSpeechTimeout, setNoSpeechTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );
  const { t, i18n } = useTranslation();

  const speechQueue = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTime = useRef<number>(0);

  const languageMap: Record<string, string> = {
    en: "en-US",
    hi: "hi-IN",
    mr: "mr-IN",
  };

  const clearAllTimeouts = useCallback(() => {
    if (noSpeechTimeout) clearTimeout(noSpeechTimeout);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

    setNoSpeechTimeout(null);
    speechTimeoutRef.current = null;
  }, [noSpeechTimeout]);

  const stopListening = useCallback(() => {
    try {
      clearAllTimeouts();
      SpeechRecognition.stopListening();
      resetTranscript();
      setIsListening(false);
      setError(null);
    } catch (error) {
      console.error("Error stopping speech recognition:", error);
      setError(t("voice.stopError"));
    }
  }, [clearAllTimeouts, t]);

  const {
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition({
    clearTranscriptOnListen: true,
    commands: [
      {
        command: [
          "book now",
          "book",
          "start booking",
          "rent",
          "rent now",
          "बुक करा",
          "भाड्याने घ्या",
          "किराये पर लें",
          "बुक करें",
          "किराया",
          "किराए पर लें",
          "अभी बुक करें",
          "किराए के लिए",
          "भाडे करा",
          "भाड्यावर घ्या",
          "आरक्षण करा",
        ],
        callback: () => {
          // ✅ Speak Marathi / Hindi / English automatically
          speak(t("voice.bookingStarted"));
          onCommand("book now");
        },
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD,
      },
      {
        command: [
          "close",
          "exit",
          "cancel",
          "go back",
          "बंद करा",
          "रद्द करा",
          "बंद करें",
          "रद्द करें",
          "वापस जाएं",
          "बाहेर पडा",
          "मागे जा",
          "रद्द",
          "बंद कीजिए",
          "वापस",
          "रद्द कीजिए",
        ],
        callback: () => onCommand("close"),
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD,
      },
      {
        command: [
          "confirm booking",
          "confirm",
          "complete booking",
          "finish booking",
          "बुकिंग कन्फर्म करा",
          "पूर्ण करा",
          "बुकिंग कन्फर्म करें",
          "पूरा करें",
          "पुष्टी करा",
          "बुकिंग पूर्ण करा",
          "बुकिंग पक्की करें",
          "आरक्षण पूरा करें",
        ],
        callback: () => onCommand("confirm booking"),
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD,
      },
    ],
  });

  const startListening = useCallback(async () => {
    try {
      if (!browserSupportsSpeechRecognition) {
        throw new Error(t("voice.unsupported"));
      }

      await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => stream.getTracks().forEach((track) => track.stop()));

      setIsListening(true);
      setError(null);
      resetTranscript();

      const recognition = SpeechRecognition.getRecognition();
      if (recognition) {
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageMap[i18n.language] || "en-US";

        const timeout = setTimeout(() => {
          stopListening();
          setError(t("voice.noSpeechDetected"));
        }, NO_SPEECH_TIMEOUT);

        setNoSpeechTimeout(timeout);

        await SpeechRecognition.startListening({
          continuous: true,
          language: languageMap[i18n.language] || "en-US",
        });
      }
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setError(t("voice.startError"));
      setIsListening(false);
    }
  }, [
    browserSupportsSpeechRecognition,
    i18n.language,
    resetTranscript,
    stopListening,
    t,
  ]);

  const processSpeechQueue = useCallback(() => {
    if (isSpeakingRef.current || speechQueue.current.length === 0) return;

    const text = speechQueue.current.shift()!;
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const currentLang = languageMap[i18n.language] || "en-US";
    utterance.lang = currentLang;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();

    let voice =
      voices.find(
        (v) =>
          v.lang === currentLang &&
          (v.name.includes("Google") || v.name.includes("Premium")),
      ) ||
      voices.find((v) => v.lang === currentLang) ||
      voices.find((v) => v.lang.startsWith(currentLang.split("-")[0])) ||
      voices.find((v) => v.default) ||
      voices[0];

    utterance.voice = voice;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      setTimeout(processSpeechQueue, 100);
    };

    setTimeout(() => window.speechSynthesis.speak(utterance), 50);
  }, [i18n.language]);

  const speak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window)) return;

      const now = Date.now();
      if (now - lastSpeechTime.current < SPEECH_DEBOUNCE_MS) {
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

        speechTimeoutRef.current = setTimeout(() => {
          speechQueue.current.push(text);
          lastSpeechTime.current = Date.now();
          processSpeechQueue();
        }, SPEECH_DEBOUNCE_MS);

        return;
      }

      lastSpeechTime.current = now;
      speechQueue.current.push(text);

      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = processSpeechQueue;
      } else {
        processSpeechQueue();
      }
    },
    [processSpeechQueue],
  );

  useEffect(() => {
    return () => {
      if (isListening) stopListening();
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      clearAllTimeouts();
      speechQueue.current = [];
      isSpeakingRef.current = false;
    };
  }, [isListening, stopListening, clearAllTimeouts]);

  return {
    isListening,
    isSpeaking,
    transcript,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    speak,
  };
}
