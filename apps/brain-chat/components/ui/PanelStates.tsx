'use client';

interface PanelLoadingProps {
  message?: string;
}

export function PanelLoading({ message = 'Načítavam...' }: PanelLoadingProps) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        {message}
      </div>
    </div>
  );
}

interface PanelEmptyProps {
  message?: string;
  icon?: string;
}

export function PanelEmpty({ message = 'Žiadne údaje', icon = '📭' }: PanelEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <span className="text-2xl">{icon}</span>
      {message}
    </div>
  );
}

interface PanelErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function PanelError({ message = 'Nepodarilo sa načítať údaje', onRetry }: PanelErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-sm gap-3">
      <span className="text-2xl">⚠️</span>
      <span className="text-muted-foreground">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 cursor-pointer min-h-[44px]"
        >
          Skúsiť znova
        </button>
      )}
    </div>
  );
}
