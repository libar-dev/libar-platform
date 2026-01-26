import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type NotificationVariant = "info" | "warning" | "success" | "error";

export interface NotificationCardProps {
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  variant?: NotificationVariant;
  actionLabel?: string;
  onAction?: () => void;
  dialog?: {
    icon?: React.ReactNode;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  };
}

const variantToBadgeVariant: Record<
  NotificationVariant,
  "default" | "secondary" | "destructive" | "outline"
> = {
  info: "default",
  warning: "secondary",
  success: "outline",
  error: "destructive",
};

const variantLabels: Record<NotificationVariant, string> = {
  info: "Info",
  warning: "Warning",
  success: "Success",
  error: "Error",
};

export function NotificationCard({
  title,
  description,
  imageUrl,
  imageAlt = "Notification image",
  variant = "info",
  actionLabel = "Learn More",
  onAction,
  dialog,
}: NotificationCardProps) {
  const ActionButton = <Button onClick={dialog ? undefined : onAction}>{actionLabel}</Button>;

  return (
    <Card className="relative w-full max-w-sm overflow-hidden pt-0">
      {imageUrl && (
        <div className="relative aspect-video w-full">
          <div className="bg-primary absolute inset-0 z-30 opacity-50 mix-blend-color" />
          <img
            src={imageUrl}
            alt={imageAlt}
            className="z-20 absolute inset-0 h-full w-full object-cover brightness-[0.6] grayscale"
          />
        </div>
      )}
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>
        {dialog ? (
          <AlertDialog>
            <AlertDialogTrigger render={ActionButton} />
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                {dialog.icon && <AlertDialogMedia>{dialog.icon}</AlertDialogMedia>}
                <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={dialog.onCancel}>
                  {dialog.cancelLabel ?? "Cancel"}
                </AlertDialogCancel>
                <AlertDialogAction onClick={dialog.onConfirm}>
                  {dialog.confirmLabel ?? "Confirm"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          ActionButton
        )}
        <Badge variant={variantToBadgeVariant[variant]} className="ml-auto">
          {variantLabels[variant]}
        </Badge>
      </CardFooter>
    </Card>
  );
}
