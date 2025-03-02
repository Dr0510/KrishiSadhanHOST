import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";

const languages = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिंदी' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' }
];

// Placeholder for a more unique language icon component
const LanguageIcon = () => <Languages className="h-5 w-5" />;


export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem('i18nextLng');
    if (savedLang && i18n.language !== savedLang) {
      handleLanguageChange(savedLang);
    }
  }, []);

  const handleLanguageChange = async (langCode: string) => {
    try {
      setIsChanging(true);
      console.debug('Changing language to:', langCode);

      // Change language and wait for it to complete
      await i18n.changeLanguage(langCode);
      localStorage.setItem('i18nextLng', langCode);
      document.documentElement.lang = langCode;

      // Reload resources for the new language
      await i18n.reloadResources(langCode);

      // Force re-render
      window.dispatchEvent(new Event('languageChanged'));

      console.debug('Language change completed for:', langCode);
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative hover:bg-green-50 transition-colors"
        >
          <LanguageIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`flex items-center justify-between ${
              i18n.language === lang.code ? 'bg-secondary' : ''
            }`}
            disabled={isChanging}
            aria-current={i18n.language === lang.code ? 'true' : undefined}
          >
            <span>{lang.label}</span>
            <span className="text-sm text-muted-foreground">
              {lang.nativeLabel}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}