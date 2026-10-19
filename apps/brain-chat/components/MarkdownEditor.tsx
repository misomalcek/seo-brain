'use client';

/**
 * MarkdownEditor — reusable tiptap WYSIWYG with markdown round-trip.
 *
 * Ported from Factorium ComposerView (Run V, 2026-05-27). Provides:
 *   • bold, italic, headings (H2-H5), bullet/ordered list, inline code,
 *     blockquote, link, divider
 *   • markdown extension (paste markdown → editor, getMarkdown() out)
 *   • placeholder + Ctrl/⌘+Enter callback
 *
 * Three call sites in Brain:
 *   1. ExpandedComposer (chat input expand modal)
 *   2. FileEditor (when editing markdown files via Files app)
 *   3. Future: brain_memories edit form
 */

import { useEffect, useRef } from 'react';
import {
  Bold, Heading2, Heading3, Heading4, Heading5, Italic,
  List, ListOrdered, Link as LinkIcon, Code, Quote, Minus, ChevronDown,
} from 'lucide-react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { useState } from 'react';

interface MarkdownEditorProps {
  /** Markdown text controlled value (re-applies when changed from outside). */
  value: string;
  /** Called with markdown on every keystroke. */
  onChange: (markdown: string) => void;
  /** Placeholder text inside editor body. */
  placeholder?: string;
  /** ⌘/Ctrl+Enter handler — optional. */
  onSubmit?: () => void;
  /** Min editor body height (px). Default 240. */
  minHeight?: number;
  /** Show the formatting toolbar (default true). */
  showToolbar?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
}

export function MarkdownEditor({
  value, onChange, placeholder, onSubmit,
  minHeight = 240, showToolbar = true, autoFocus = false,
}: MarkdownEditorProps) {
  const [headingsOpen, setHeadingsOpen] = useState(false);
  const headingsRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'font-mono text-[12px] bg-background rounded p-2' } },
        blockquote: { HTMLAttributes: { class: 'border-l-2 border-primary pl-3 text-muted-foreground' } },
        heading: { levels: [1, 2, 3, 4, 5] },
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline underline-offset-2' } }),
      Placeholder.configure({ placeholder: placeholder || 'Píš v markdown…' }),
      Markdown.configure({ html: false, breaks: true, transformPastedText: true }),
    ],
    content: value,
    autofocus: autoFocus,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none px-4 py-3 outline-none',
        style: `min-height: ${minHeight}px;`,
      },
      handleKeyDown(_view, event) {
        if (onSubmit && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      const md = (editor.storage as any).markdown?.getMarkdown?.() ?? editor.getHTML();
      onChange(md);
    },
  });

  // Sync external value changes (e.g. snippet load) into editor.
  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as any).markdown?.getMarkdown?.() ?? '';
    if (current.trim() === value.trim()) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  // Close headings popover on outside click.
  useEffect(() => {
    if (!headingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!headingsRef.current?.contains(e.target as Node)) setHeadingsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [headingsOpen]);

  const activeHeading = [2, 3, 4, 5].find((l) => editor?.isActive('heading', { level: l }));

  return (
    <div className="flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-background/50">
          <TBtn icon={Bold}   hint="Tučné (⌘B)"  editor={editor} active={editor?.isActive('bold')}   onClick={(e) => e.chain().focus().toggleBold().run()} />
          <TBtn icon={Italic} hint="Kurzíva (⌘I)" editor={editor} active={editor?.isActive('italic')} onClick={(e) => e.chain().focus().toggleItalic().run()} />

          <div className="relative" ref={headingsRef}>
            <button
              onClick={() => setHeadingsOpen((v) => !v)}
              disabled={!editor}
              title="Nadpis (H2-H5)"
              className={`h-7 px-1.5 rounded flex items-center gap-0.5 transition-colors ${
                activeHeading ? 'text-primary bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              } disabled:opacity-30`}
            >
              <Heading2 size={13} strokeWidth={1.8} />
              <span className="font-mono text-[10px]">{activeHeading ? `H${activeHeading}` : 'H'}</span>
              <ChevronDown size={9} className="opacity-60" />
            </button>
            {headingsOpen && editor && (
              <div className="absolute z-20 top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg p-1 flex flex-col gap-0.5 min-w-[140px]">
                {[2, 3, 4, 5].map((lvl) => {
                  const IconN = ({ 2: Heading2, 3: Heading3, 4: Heading4, 5: Heading5 } as Record<number, any>)[lvl];
                  const isActive = editor.isActive('heading', { level: lvl });
                  return (
                    <button
                      key={lvl}
                      onClick={() => { editor.chain().focus().toggleHeading({ level: lvl as any }).run(); setHeadingsOpen(false); }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                        isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                      }`}
                    >
                      <IconN size={12} strokeWidth={1.8} />
                      <span className="font-mono text-[11px]">Heading {lvl}</span>
                    </button>
                  );
                })}
                <div className="border-t border-border my-0.5" />
                <button
                  onClick={() => { editor.chain().focus().setParagraph().run(); setHeadingsOpen(false); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                >
                  <span className="font-mono text-[11px]">Paragraph</span>
                </button>
              </div>
            )}
          </div>

          <Sep />
          <TBtn icon={List}        hint="Odrážky"     editor={editor} active={editor?.isActive('bulletList')}  onClick={(e) => e.chain().focus().toggleBulletList().run()} />
          <TBtn icon={ListOrdered} hint="Číslovanie"  editor={editor} active={editor?.isActive('orderedList')} onClick={(e) => e.chain().focus().toggleOrderedList().run()} />
          <TBtn icon={Code}        hint="Inline kód"  editor={editor} active={editor?.isActive('code')}        onClick={(e) => e.chain().focus().toggleCode().run()} />
          <TBtn icon={Quote}       hint="Citácia"     editor={editor} active={editor?.isActive('blockquote')}  onClick={(e) => e.chain().focus().toggleBlockquote().run()} />
          <TBtn icon={LinkIcon}    hint="Odkaz"       editor={editor} active={editor?.isActive('link')}        onClick={(e) => {
            const prev = e.getAttributes('link').href;
            const url = window.prompt('URL', prev || 'https://');
            if (url === null) return;
            if (url === '') { e.chain().focus().unsetLink().run(); return; }
            e.chain().focus().setLink({ href: url }).run();
          }} />
          <TBtn icon={Minus}       hint="Oddeľovač"   editor={editor} active={false} onClick={(e) => e.chain().focus().setHorizontalRule().run()} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function TBtn({
  icon: Icon, hint, editor, active, onClick,
}: {
  icon: typeof Bold; hint: string; editor: Editor | null; active?: boolean;
  onClick: (editor: Editor) => void;
}) {
  return (
    <button
      onClick={() => editor && onClick(editor)}
      disabled={!editor}
      title={hint}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        active ? 'text-primary bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
      } disabled:opacity-30`}
    >
      <Icon size={13} strokeWidth={1.8} />
    </button>
  );
}

function Sep() { return <div className="w-px h-4 bg-border mx-0.5" />; }
