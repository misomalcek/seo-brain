'use client';

import type { TeamMessage, ChatAttachment } from '@/lib/types';
import { getFileDownloadUrl, getHTMLReportViewUrl } from '@/lib/api';

interface TeamChatMessageProps {
  message: TeamMessage;
  isOwn: boolean;
  onClickUser?: (userId: string) => void;
  onOpenConversation?: (conversationId: string) => void;
}

function HighlightBrain({ text }: { text: string }) {
  const parts = text.split(/(@Brain)/gi);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === '@brain' ? (
          <span key={i} className="text-primary font-medium">@Brain</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const attachmentIcons: Record<string, string> = {
  file: '📁',
  conversation: '💬',
  report: '📊',
};

function AttachmentCard({
  attachment,
  onOpenConversation,
}: {
  attachment: ChatAttachment;
  onOpenConversation?: (conversationId: string) => void;
}) {
  // Resolve primary action (click on card body) + secondary download (files only).
  const primaryAction = (() => {
    if (attachment.type === 'file') return { href: getFileDownloadUrl(attachment.id), target: '_blank', title: 'Otvoriť / stiahnuť súbor' };
    if (attachment.type === 'report') return { href: getHTMLReportViewUrl(attachment.id), target: '_blank', title: 'Otvoriť report' };
    return null; // conversation handled via onClick
  })();

  const downloadHref = attachment.type === 'file' ? getFileDownloadUrl(attachment.id) : null;

  const body = (
    <>
      <span>{attachmentIcons[attachment.type] || '📎'}</span>
      <span className="font-medium truncate max-w-[180px]">{attachment.title}</span>
      {attachment.meta && (
        <span className="text-muted-foreground">{attachment.meta}</span>
      )}
    </>
  );

  const baseClass = "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card border border-border text-xs text-foreground hover:bg-muted hover:border-primary/30 transition-colors";

  return (
    <span className="inline-flex items-center gap-1">
      {primaryAction ? (
        <a
          href={primaryAction.href}
          target={primaryAction.target}
          rel="noopener noreferrer"
          title={primaryAction.title}
          className={`${baseClass} cursor-pointer`}
        >
          {body}
        </a>
      ) : attachment.type === 'conversation' && onOpenConversation ? (
        <button
          type="button"
          onClick={() => onOpenConversation(attachment.id)}
          title="Otvoriť konverzáciu"
          className={`${baseClass} cursor-pointer`}
        >
          {body}
        </button>
      ) : (
        <span className={`${baseClass} cursor-default`}>{body}</span>
      )}

      {/* Inline action icons */}
      {attachment.type === 'file' && (
        <>
          <a
            href={getFileDownloadUrl(attachment.id)}
            target="_blank"
            rel="noopener noreferrer"
            download
            title="Stiahnuť"
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label={`Stiahnuť ${attachment.title}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <a
            href={getFileDownloadUrl(attachment.id)}
            target="_blank"
            rel="noopener noreferrer"
            title="Zobraziť"
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label={`Zobraziť ${attachment.title}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </a>
        </>
      )}
      {attachment.type === 'report' && (
        <a
          href={getHTMLReportViewUrl(attachment.id)}
          target="_blank"
          rel="noopener noreferrer"
          title="Otvoriť report"
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label={`Otvoriť ${attachment.title}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      )}
    </span>
  );
}

export function TeamChatMessage({ message, isOwn, onClickUser, onOpenConversation }: TeamChatMessageProps) {
  const time = new Date(message.createdAt).toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' });
  const attachments = message.attachments || [];

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        isOwn
          ? 'bg-gradient-to-br from-primary to-accent text-background'
          : 'bg-muted text-foreground'
      }`}>
        {message.userName.charAt(0).toUpperCase()}
      </div>

      <div className={`max-w-[75%] ${isOwn ? 'text-right' : ''}`}>
        {/* Name + time */}
        <div className={`flex items-center gap-2 mb-0.5 text-xs text-muted-foreground ${isOwn ? 'justify-end' : ''}`}>
          <button
            onClick={() => onClickUser?.(message.userId)}
            className="font-medium hover:text-primary transition-colors cursor-pointer"
          >
            {message.userName}
          </button>
          <span>{time}</span>
        </div>

        {/* Message bubble */}
        {message.content && (
          <div className={`inline-block px-3 py-2 rounded-xl text-sm ${
            isOwn
              ? 'bg-primary/20 text-foreground rounded-tr-sm'
              : 'bg-card border border-border text-foreground rounded-tl-sm'
          }`}>
            {message.mentionsBrain ? (
              <HighlightBrain text={message.content} />
            ) : (
              message.content
            )}
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mt-1 ${isOwn ? 'justify-end' : ''}`}>
            {attachments.map((att, i) => (
              <AttachmentCard key={i} attachment={att} onOpenConversation={onOpenConversation} />
            ))}
          </div>
        )}

        {/* Brain response */}
        {message.brainResponse && (
          <div className={`mt-1.5 ml-2 p-2.5 rounded-lg text-sm ${
            message.brainResponse.startsWith('[Error:')
              ? 'bg-red-500/5 border border-red-500/20'
              : 'bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20'
          }`}>
            <div className={`flex items-center gap-1.5 mb-1 text-xs font-medium ${
              message.brainResponse.startsWith('[Error:') ? 'text-red-400' : 'text-primary'
            }`}>
              <span>{message.brainResponse.startsWith('[Error:') ? '⚠' : '🧠'}</span> Brain
            </div>
            <div className={`text-xs leading-relaxed ${
              message.brainResponse.startsWith('[Error:') ? 'text-red-300' : 'text-foreground'
            }`}>
              {message.brainResponse.startsWith('[Error:') ? 'Brain nedokazal odpovedat. Skuste znova neskor.' : message.brainResponse}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
