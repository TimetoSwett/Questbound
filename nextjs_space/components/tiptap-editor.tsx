'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Code, Heading1, Heading2, Link as LinkIcon, Undo, Redo, Minus } from 'lucide-react';
import { useEffect } from 'react';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export function TipTapEditor({ content, onChange, placeholder, editable = true }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write something...' }),
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => {
      onChange(e?.getHTML?.() ?? '');
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands?.setContent?.(content);
    }
  }, [content, editor]);

  useEffect(() => {
    editor?.setEditable?.(editable);
  }, [editable, editor]);

  if (!editor) return null;

  const BtnClass = 'p-1.5 rounded hover:bg-muted transition-colors';
  const active = (name: string, attrs?: any) => editor?.isActive?.(name, attrs) ? 'bg-muted text-primary' : 'text-muted-foreground';

  return (
    <div className="tiptap-editor rounded-lg border border-border bg-card">
      {editable && (
        <div className="flex flex-wrap gap-0.5 p-2 border-b border-border">
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleHeading?.({ level: 1 })?.run?.()} className={`${BtnClass} ${active('heading', { level: 1 })}`}><Heading1 className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleHeading?.({ level: 2 })?.run?.()} className={`${BtnClass} ${active('heading', { level: 2 })}`}><Heading2 className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleBold?.()?.run?.()} className={`${BtnClass} ${active('bold')}`}><Bold className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleItalic?.()?.run?.()} className={`${BtnClass} ${active('italic')}`}><Italic className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleUnderline?.()?.run?.()} className={`${BtnClass} ${active('underline')}`}><UnderlineIcon className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleBulletList?.()?.run?.()} className={`${BtnClass} ${active('bulletList')}`}><List className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleOrderedList?.()?.run?.()} className={`${BtnClass} ${active('orderedList')}`}><ListOrdered className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleBlockquote?.()?.run?.()} className={`${BtnClass} ${active('blockquote')}`}><Quote className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.toggleCodeBlock?.()?.run?.()} className={`${BtnClass} ${active('codeBlock')}`}><Code className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.setHorizontalRule?.()?.run?.()} className={`${BtnClass} text-muted-foreground`}><Minus className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button type="button" onClick={() => { const url = prompt('URL:'); if (url) editor?.chain?.()?.focus?.()?.setLink?.({ href: url })?.run?.(); }} className={`${BtnClass} ${active('link')}`}><LinkIcon className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.undo?.()?.run?.()} className={`${BtnClass} text-muted-foreground`}><Undo className="w-4 h-4" /></button>
          <button type="button" onClick={() => editor?.chain?.()?.focus?.()?.redo?.()?.run?.()} className={`${BtnClass} text-muted-foreground`}><Redo className="w-4 h-4" /></button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
