import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { reviewSchema } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";

interface ReviewFormProps {
  equipmentId: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitSuccess?: () => void;
}

export function ReviewForm({ equipmentId, isOpen, onOpenChange, onSubmitSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setComment("");
      setHasAttemptedSubmit(false);
    }
  }, [isOpen]);

  const isCommentValid = comment.length >= 10 && comment.length <= 500;
  const isFormValid = rating > 0 && isCommentValid;

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: t('review.error'),
        description: t('review.loginRequired'),
        variant: "destructive",
      });
      return;
    }

    setHasAttemptedSubmit(true);

    if (!isFormValid) {
      return;
    }

    try {
      setIsSubmitting(true);

      const reviewData = {
        userId: user.id,
        equipmentId,
        rating,
        comment: comment.trim(),
        createdAt: new Date().toISOString()
      };

      console.log('Submitting review with data:', reviewData);

      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(reviewData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to submit review');
      }

      const result = await response.json();
      console.log('Review submission response:', result);

      // Invalidate relevant queries
      await queryClient.invalidateQueries({ queryKey: [`/api/equipment/${equipmentId}/reviews`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/equipment/${equipmentId}`] });
      await queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });

      toast({
        title: t('review.success'),
        description: t('review.thankYou'),
      });

      onSubmitSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({
        title: t('review.error'),
        description: error instanceof Error ? error.message : t('review.error'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && (isSubmitting || (comment.length > 0 && !isCommentValid))) {
      return;
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('review.title')}</DialogTitle>
          <DialogDescription>
            {t('review.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center space-y-2">
            <div className="flex justify-center space-x-2" role="radiogroup" aria-label={t('review.ratingLabel')}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`p-1 rounded-full transition-colors hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary ${
                    rating >= star ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                  aria-label={t('review.starRating', { count: star })}
                  aria-pressed={rating >= star}
                  disabled={isSubmitting}
                >
                  <Star className={`w-8 h-8 ${rating >= star ? 'fill-current' : ''}`} />
                </button>
              ))}
            </div>
            {hasAttemptedSubmit && rating === 0 && (
              <p className="text-sm text-destructive">
                {t('review.selectRating')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder={t('review.commentPlaceholder')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`min-h-[100px] ${
                hasAttemptedSubmit && !isCommentValid ? 'border-destructive' : ''
              }`}
              disabled={isSubmitting}
            />
            {hasAttemptedSubmit && comment.length > 0 && !isCommentValid && (
              <p className="text-sm text-destructive">
                {comment.length < 10 
                  ? t('review.commentTooShort')
                  : t('review.commentTooLong')}
              </p>
            )}
            <p className={`text-sm ${comment.length > 500 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {comment.length}/500 {t('review.characters')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('review.submitting')}
              </>
            ) : (
              t('review.submit')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}