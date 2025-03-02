import { useState, useEffect, useCallback } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useTranslation } from 'react-i18next';

type VoiceCommandHandler = (command: string) => void;

interface UseVoiceAssistantProps {
  onCommand: VoiceCommandHandler;
  language?: string;
}

const COMMAND_THRESHOLD = 0.8; // Fuzzy matching threshold
const NO_SPEECH_TIMEOUT = 10000; // 10 seconds

export function useVoiceAssistant({ onCommand, language = 'en-US' }: UseVoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSpeechTimeout, setNoSpeechTimeout] = useState<NodeJS.Timeout | null>(null);
  const { t, i18n } = useTranslation();

  // Language mapping for voice recognition
  const languageMap: Record<string, string> = {
    'en': 'en-US',
    'hi': 'hi-IN',
    'mr': 'mr-IN'
  };

  // Debug logging for language settings
  useEffect(() => {
    console.debug('Voice Recognition Settings:', {
      currentLanguage: i18n.language,
      mappedLanguage: languageMap[i18n.language] || 'en-US',
      supportedLanguages: Object.keys(languageMap),
      browserSupport: !!window.SpeechRecognition || !!window.webkitSpeechRecognition
    });
  }, [i18n.language]);

  // Clear timeouts on cleanup
  const clearTimeouts = useCallback(() => {
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      setNoSpeechTimeout(null);
    }
  }, [noSpeechTimeout]);

  // Stop listening with cleanup
  const stopListening = useCallback(() => {
    try {
      console.debug('Stopping voice recognition...');
      clearTimeouts();
      SpeechRecognition.stopListening();
      resetTranscript();
      setIsListening(false);
      setError(null);
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
      setError(t('voice.stopError'));
    }
  }, [clearTimeouts, t]);

  const {
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition({
    clearTranscriptOnListen: true,
    commands: [
      {
        command: [
          'book now', 'book', 'start booking', 'rent', 'rent now',
          'बुक करा', 'भाड्याने घ्या', // Marathi
          'किराये पर लें', 'बुक करें', 'किराया', 'किराए पर लें', // Hindi
          'अभी बुक करें', 'किराए के लिए', // Additional Hindi variations
          'भाडे करा', 'भाड्यावर घ्या', 'आरक्षण करा' // Additional Marathi variations
        ],
        callback: () => {
          console.debug('Executing book command');
          onCommand('book now');
        },
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD
      },
      {
        command: [
          'close', 'exit', 'cancel', 'go back',
          'बंद करा', 'रद्द करा', // Marathi
          'बंद करें', 'रद्द करें', 'वापस जाएं', // Hindi
          'बाहेर पडा', 'मागे जा', 'रद्द', // Additional Marathi
          'बंद कीजिए', 'वापस', 'रद्द कीजिए' // Additional Hindi
        ],
        callback: () => {
          console.debug('Executing close command');
          onCommand('close');
        },
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD
      },
      {
        command: [
          'confirm booking', 'confirm', 'complete booking', 'finish booking',
          'बुकिंग कन्फर्म करा', 'पूर्ण करा', // Marathi
          'बुकिंग कन्फर्म करें', 'पूरा करें', // Hindi
          'पुष्टी करा', 'बुकिंग पूर्ण करा', // Additional Marathi
          'बुकिंग पक्की करें', 'आरक्षण पूरा करें' // Additional Hindi
        ],
        callback: () => {
          console.debug('Executing confirm command');
          onCommand('confirm booking');
        },
        isFuzzyMatch: true,
        fuzzyMatchingThreshold: COMMAND_THRESHOLD
      }
    ]
  });

  // Start listening with improved error handling
  const startListening = useCallback(async () => {
    try {
      if (!browserSupportsSpeechRecognition) {
        throw new Error(t('voice.unsupported'));
      }

      console.debug('Requesting microphone permission...');
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => stream.getTracks().forEach(track => track.stop()));

      setIsListening(true);
      setError(null);
      resetTranscript();

      const recognition = SpeechRecognition.getRecognition();
      if (recognition) {
        console.debug('Configuring speech recognition:', {
          language: languageMap[i18n.language] || 'en-US',
          continuous: true,
          interimResults: true
        });

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageMap[i18n.language] || 'en-US';

        // Set up timeout for no speech
        const timeout = setTimeout(() => {
          console.debug('No speech detected, stopping recognition');
          stopListening();
          setError(t('voice.noSpeechDetected'));
        }, NO_SPEECH_TIMEOUT);
        setNoSpeechTimeout(timeout);

        await SpeechRecognition.startListening({
          continuous: true,
          language: languageMap[i18n.language] || 'en-US'
        });
      }
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError(t('voice.startError'));
      setIsListening(false);
    }
  }, [browserSupportsSpeechRecognition, i18n.language, resetTranscript, stopListening, t]);

  // Text-to-speech with improved reliability
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.error('Browser does not support speech synthesis');
      return;
    }

    try {
      console.debug('Starting speech synthesis:', {
        text,
        language: languageMap[i18n.language] || 'en-US'
      });

      window.speechSynthesis.cancel(); // Clear queue

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = languageMap[i18n.language] || 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang === utterance.lang) || voices[0];
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        window.speechSynthesis.cancel();
      };
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        window.speechSynthesis.cancel();
      };

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Speech synthesis error:', error);
      setIsSpeaking(false);
    }
  }, [i18n.language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) stopListening();
      if (isSpeaking) window.speechSynthesis.cancel();
      clearTimeouts();
    };
  }, [isListening, isSpeaking, stopListening, clearTimeouts]);

  return {
    isListening,
    isSpeaking,
    transcript,
    error,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    speak
  };
}