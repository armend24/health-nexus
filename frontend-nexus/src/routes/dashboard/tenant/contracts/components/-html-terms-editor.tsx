import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontSize } from '@tiptap/extension-text-style/font-size';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from 'lucide-react';

interface HtmlTermsEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

export function HtmlTermsEditor({
  value,
  onChange,
  placeholder = 'Write contract terms (e.g. compensation, responsibilities)...',
  disabled = false,
  className,
  minHeight = '12rem',
}: HtmlTermsEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      TextStyle,
      FontSize.configure({
        types: ['textStyle'],
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-w-0',
          'px-3 py-2 min-h-[8rem]'
        ),
      },
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && (value || current !== '<p></p>')) {
      editor.commands.setContent(value || '', {
        emitUpdate: false,
      });
    }
  }, [value, editor]);

  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-md border bg-muted',
          className
        )}
        style={{ minHeight }}
      />
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-background',
        disabled && 'opacity-60',
        className
      )}
      style={{ minHeight }}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/50 p-1">
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('bold')}
          onPressedChange={() =>
            editor.chain().focus().toggleBold().run()
          }
          disabled={disabled}
          aria-label="Bold"
        >
          <BoldIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('italic')}
          onPressedChange={() =>
            editor.chain().focus().toggleItalic().run()
          }
          disabled={disabled}
          aria-label="Italic"
        >
          <ItalicIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('underline')}
          onPressedChange={() =>
            editor.chain().focus().toggleUnderline().run()
          }
          disabled={disabled}
          aria-label="Underline"
        >
          <UnderlineIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('strike')}
          onPressedChange={() =>
            editor.chain().focus().toggleStrike().run()
          }
          disabled={disabled}
          aria-label="Strikethrough"
        >
          <StrikethroughIcon className="size-4" />
        </Toggle>
        <span className="mx-1 h-4 w-px bg-border" />
        {([10, 12, 14, 16, 18, 24] as const).map((px) => (
          <Button
            key={px}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-8 px-1.5 font-mono text-xs"
            onClick={() =>
              editor.chain().focus().setFontSize(`${px}px`).run()
            }
            disabled={disabled}
            aria-label={`Font size ${px}px`}
            title={`${px}px`}
          >
            {px}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive({
            textAlign: 'left',
          })}
          onPressedChange={() =>
            editor.chain().focus().setTextAlign('left').run()
          }
          disabled={disabled}
          aria-label="Align left"
        >
          <AlignLeftIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive({
            textAlign: 'center',
          })}
          onPressedChange={() =>
            editor.chain().focus().setTextAlign('center').run()
          }
          disabled={disabled}
          aria-label="Align center"
        >
          <AlignCenterIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive({
            textAlign: 'right',
          })}
          onPressedChange={() =>
            editor.chain().focus().setTextAlign('right').run()
          }
          disabled={disabled}
          aria-label="Align right"
        >
          <AlignRightIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive({
            textAlign: 'justify',
          })}
          onPressedChange={() =>
            editor.chain().focus().setTextAlign('justify').run()
          }
          disabled={disabled}
          aria-label="Justify"
        >
          <AlignJustifyIcon className="size-4" />
        </Toggle>
        <span className="mx-1 h-4 w-px bg-border" />
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('bulletList')}
          onPressedChange={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          disabled={disabled}
          aria-label="Bullet list"
        >
          <ListIcon className="size-4" />
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={editor.isActive('orderedList')}
          onPressedChange={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          disabled={disabled}
          aria-label="Numbered list"
        >
          <ListOrderedIcon className="size-4" />
        </Toggle>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
