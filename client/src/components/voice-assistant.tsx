import { Button } from "@/components/ui/button";
import { Mic, MicOff, Volume2, AlertCircle, Loader2, HelpCircle } from "lucide-react";
import { useVoiceAssistant } from "@/hooks/use-voice-assistant";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VoiceAssistantProps {
  onCommand: (command: string) => void;
  className?: string;
}

export function VoiceAssistant({ onCommand, className }: VoiceAssistantProps) {
  const { t, i18n } = useTranslation();
  const [isInitializing, setIsInitializing] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  const {
    isListening,
    isSpeaking,
    transcript,
    error: voiceError,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    speak,
  } = useVoiceAssistant({
    onCommand,
  });

  // Reset error state when language changes
  useEffect(() => {
    setRecognitionError(null);
  }, [i18n.language]);

  // Debug logging for voice assistant state
  useEffect(() => {
    console.debug('Voice Assistant Status:', {
      isInitializing,
      browserSupport: browserSupportsSpeechRecognition,
      microphoneAvailable: isMicrophoneAvailable,
      isListening,
      isSpeaking,
      error: voiceError,
      currentLanguage: i18n.language,
      recognitionError
    });
  }, [
    isInitializing,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    isListening,
    isSpeaking,
    voiceError,
    i18n.language,
    recognitionError
  ]);

  const toggleListening = useCallback(async () => {
    try {
      setRecognitionError(null);

      if (isListening) {
        console.debug('Stopping voice assistant...');
        stopListening();
      } else {
        console.debug('Starting voice assistant...');
        setIsInitializing(true);
        await startListening();
        speak(t('voice.listening'));
      }
    } catch (error) {
      console.error('Error toggling voice recognition:', error);
      setRecognitionError(error instanceof Error ? error.message : t('voice.startError'));
    } finally {
      setIsInitializing(false);
    }
  }, [isListening, startListening, stopListening, speak, t]);

  if (!browserSupportsSpeechRecognition) {
    console.warn('Browser does not support speech recognition');
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('common.error')}</AlertTitle>
        <AlertDescription>
          {t('voice.unsupported')}
        </AlertDescription>
      </Alert>
    );
  }

  if (!isMicrophoneAvailable) {
    console.warn('Microphone is not available');
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('common.error')}</AlertTitle>
        <AlertDescription>
          {t('voice.noMicrophone')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col items-start gap-2", className)}>
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isListening ? "default" : "outline"}
                size="icon"
                onClick={toggleListening}
                disabled={isInitializing}
                className={cn(
                  "transition-all duration-300",
                  isListening && "animate-pulse ring-2 ring-primary ring-offset-2",
                  !isListening && "hover:bg-primary/10",
                  (voiceError || recognitionError) && "ring-2 ring-destructive"
                )}
                aria-label={isListening ? t('voice.stopListening') : t('voice.startListening')}
              >
                {isInitializing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isListening ? (
                  <Mic className="h-4 w-4 animate-bounce" aria-hidden="true" />
                ) : (
                  <MicOff className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <p>{t('voice.commandHelp')}</p>
            </TooltipContent>
          </Tooltip>

          {isListening && (
            <Badge 
              variant="secondary"
              className="animate-pulse flex items-center gap-2 max-w-xs truncate"
              role="status"
              aria-live="polite"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" aria-hidden="true" />
              <span className="truncate">{transcript || t('voice.listening')}</span>
            </Badge>
          )}

          {isSpeaking && (
            <Badge 
              variant="secondary"
              className="flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <Volume2 className="h-4 w-4 animate-pulse" aria-hidden="true" />
              {t('voice.speaking')}
            </Badge>
          )}
        </div>

        {(voiceError || recognitionError) && (
          <Alert variant="destructive" className="mt-2 max-w-md" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {voiceError || recognitionError}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </TooltipProvider>
  );
}