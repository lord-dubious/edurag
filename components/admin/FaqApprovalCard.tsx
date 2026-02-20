'use client';

import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckIcon, PencilIcon, XIcon, CheckCircleIcon } from 'lucide-react';

interface FaqApprovalCardProps {
  faq: {
    _id: string;
    question: string;
    answer: string;
    count: number;
    public: boolean;
    pendingApproval: boolean;
  };
  onApprove: (id: string, editedAnswer?: string) => void;
  onReject?: (id: string) => void;
  isPending?: boolean;
}

export function FaqApprovalCard({ faq, onApprove, onReject, isPending = false }: FaqApprovalCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState(faq.answer);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(faq._id, isEditing ? editedAnswer : undefined);
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (onReject) {
      setIsSubmitting(true);
      try {
        await onReject(faq._id);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const getRankBadge = (count: number) => {
    if (count >= 50) return { label: 'Hot', variant: 'destructive' as const };
    if (count >= 20) return { label: 'Popular', variant: 'default' as const };
    if (count >= 10) return { label: 'Trending', variant: 'secondary' as const };
    return { label: 'New', variant: 'outline' as const };
  };

  const rankBadge = getRankBadge(faq.count);

  return (
    <Card className={`${isPending ? 'border-yellow-500/50 dark:border-yellow-500/30' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={rankBadge.variant}>{rankBadge.label}</Badge>
            {isPending && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                Pending
              </Badge>
            )}
            {faq.public && !faq.pendingApproval && (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                <CheckCircleIcon className="size-3 mr-1" />
                Approved
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            Asked {faq.count} {faq.count === 1 ? 'time' : 'times'}
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <h3 className="font-medium leading-snug">{faq.question}</h3>
        
        {isEditing ? (
          <Textarea
            value={editedAnswer}
            onChange={(e) => setEditedAnswer(e.target.value)}
            className="min-h-[100px]"
            placeholder="Edit the answer..."
          />
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {faq.answer || 'No answer generated yet.'}
          </p>
        )}
      </CardContent>

      {isPending && (
        <CardFooter className="pt-3 border-t">
          <div className="flex items-center justify-between w-full">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedAnswer(faq.answer);
                  }}
                  disabled={isSubmitting}
                >
                  <XIcon className="size-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={isSubmitting || !editedAnswer.trim()}
                >
                  <CheckIcon className="size-4 mr-1" />
                  Save & Approve
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  disabled={isSubmitting}
                >
                  <PencilIcon className="size-4 mr-1" />
                  Edit
                </Button>
                {onReject && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleReject}
                    disabled={isSubmitting}
                    className="text-destructive hover:text-destructive"
                  >
                    <XIcon className="size-4 mr-1" />
                    Reject
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                >
                  <CheckIcon className="size-4 mr-1" />
                  Approve
                </Button>
              </div>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
