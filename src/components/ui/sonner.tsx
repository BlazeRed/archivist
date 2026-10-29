import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Status reads from the icon color (fill tokens: the toast sits on the inverted secondary surface)
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--secondary)",
          "--normal-text": "var(--secondary-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Spec §10 Toast: 10/14 padding, 12px text, --shadow-2
          toast: "cn-toast px-3.5! py-2.5! text-xs! shadow-float!",
          title: "font-semibold",
          // Sonner hardcodes description color per theme (#3f3f3f / #e8e8e8), which vanishes on our inverted secondary bg
          description: "text-secondary-foreground/80!",
          // Pills like every other button. Action keeps Sonner's inverted fill (--normal-text on --normal-bg);
          // cancel is the outline counterpart, placed first (Cancel → action, as in dialogs)
          actionButton: "rounded-full! h-7! px-3! text-xs! font-medium! hover:brightness-95",
          cancelButton: "rounded-full! h-7! px-3! text-xs! font-medium! bg-transparent! text-secondary-foreground! ring-1 ring-inset ring-secondary-foreground/40",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
