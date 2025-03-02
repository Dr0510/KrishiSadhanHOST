import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold mb-3">{t('branding.name')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('branding.description')}
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-3">{t('footer.quickLinks')}</h3>
            <ul className="space-y-2">
              <li>
                <Link 
                  href="/equipment"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {t('nav.equipment')}
                </Link>
              </li>
              <li>
                <Link 
                  href="/compare"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {t('equipment.compareEquipment')}
                </Link>
              </li>
              <li>
                <Link 
                  href="/dashboard"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {t('nav.bookings')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3">{t('footer.contact')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('footer.email')}<br />
              {t('footer.phone')}
            </p>
          </div>
        </div>
        <div className="border-t mt-6 pt-6 text-center text-sm text-muted-foreground">
          {t('footer.copyright')}
        </div>
      </div>
    </footer>
  );
}