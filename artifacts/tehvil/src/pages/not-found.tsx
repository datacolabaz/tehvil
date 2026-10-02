import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { copy, type Lang } from '@/lib/i18n';
import { getLanguage } from '@/lib/language';

export default function NotFound({ lang = getLanguage() }: { lang?: Lang }) {
  const c = copy[lang];
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">
              404 · {c.notFoundTitle}
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {c.notFoundNote}
          </p>
          <Link href="/" className="button button-primary mt-4">{c.backHome}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
