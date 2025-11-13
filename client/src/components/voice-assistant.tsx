import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Volume2,
  AlertCircle,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { useVoiceAssistant } from "@/hooks/use-voice-assistant";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useCallback, useEffect, memo } from "react";
import { cn } from "@/lib/utils";

interface VoiceAssistantProps {
  onCommand: (command: string) => void;
  className?: string;
}

// Mic waveform animation (unchanged)
const WaveformAnimation = memo(() => (
  <div className="flex items-center gap-1" aria-hidden="true">
    {[0, 100, 200, 300, 400].map((delay, index) => (
      <span
        key={index}
        className={cn(
          "w-1 rounded-full bg-blue-500 animate-pulse",
          index === 2
            ? "h-8 bg-blue-600"
            : index === 1 || index === 3
              ? "h-6"
              : "h-4",
        )}
        style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
      />
    ))}
  </div>
));

WaveformAnimation.displayName = "WaveformAnimation";

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
    onCommand: (cmd) => {
      if (cmd === "book now") {
        speak(t("voice.bookingStarted")); // ✅ FIXED: Marathi/Hindi/English speaking here
      }
      if (cmd === "close") {
        speak(t("voice.dialogClosed"));
      }
      if (cmd === "confirm booking") {
        speak(t("voice.bookingConfirmed"));
      }

      onCommand(cmd); // keep original parent function call
    },
  });

  useEffect(() => {
    setRecognitionError(null);
  }, [i18n.language]);

  const toggleListening = useCallback(async () => {
    if (isInitializing) return;

    try {
      setRecognitionError(null);

      if (isListening) {
        stopListening();
      } else {
        setIsInitializing(true);
        await startListening();
        speak(t("voice.listening"));
      }
    } catch (error) {
      console.error("Error toggling voice recognition:", error);
      setRecognitionError(
        error instanceof Error ? error.message : t("voice.startError"),
      );
    } finally {
      setIsInitializing(false);
    }
  }, [isListening, startListening, stopListening, speak, t, isInitializing]);

  if (!browserSupportsSpeechRecognition) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t("voice.unsupported")}</AlertDescription>
      </Alert>
    );
  }

  if (!isMicrophoneAvailable) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t("voice.noMicrophone")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col items-start gap-3", className)}>
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative group">
                <Button
                  variant={isListening ? "default" : "outline"}
                  size="icon"
                  onClick={toggleListening}
                  disabled={isInitializing}
                  className={cn(
                    "relative h-14 w-14 rounded-full transition-all duration-300 ease-out",
                    isListening && "bg-blue-600 scale-110 shadow-xl",
                    !isListening &&
                      "hover:bg-blue-50 hover:scale-105 shadow-md",
                  )}
                >
                  {isInitializing ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : isListening ? (
                    <Mic className="h-6 w-6 text-white" />
                  ) : (
                    <MicOff className="h-6 w-6 text-blue-600" />
                  )}
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("voice.commandHelp")}
            </TooltipContent>
          </Tooltip>

          {isListening && (
            <Badge className="px-5 py-3 rounded-full bg-blue-100 shadow">
              <WaveformAnimation />
              <span>{transcript || t("voice.listening")}</span>
            </Badge>
          )}

          {isSpeaking && (
            <Badge className="px-5 py-3 rounded-full bg-green-100 shadow">
              <Volume2 className="h-5 w-5" />
              <span>{t("voice.speaking")}</span>
            </Badge>
          )}
        </div>

        {(voiceError || recognitionError) && (
          <Alert variant="destructive" className="max-w-md mt-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDescription>
              {voiceError || recognitionError}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </TooltipProvider>
  );
}
