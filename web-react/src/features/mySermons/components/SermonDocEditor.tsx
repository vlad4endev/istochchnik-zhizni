import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, type ReactNode } from 'react';
import {
  LuAlignCenter,
  LuAlignLeft,
  LuAlignRight,
  LuBold,
  LuHeading1,
  LuHeading2,
  LuHeading3,
  LuHighlighter,
  LuItalic,
  LuLink,
  LuList,
  LuListChecks,
  LuListOrdered,
  LuMinus,
  LuQuote,
  LuRedo2,
  LuStrikethrough,
  LuUnderline,
  LuUndo2,
} from 'react-icons/lu';

type Props = {
  initialHtml: string;
  editable?: boolean;
  placeholder?: string;
  onChangeHtml: (html: string) => void;
};

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm transition',
        active ? 'bg-primary/15 text-primary' : 'text-stone-600 hover:bg-stone-100',
        disabled ? 'opacity-40' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function SermonDocEditor({
  initialHtml,
  editable = true,
  placeholder = 'Начните писать конспект… Используйте панель инструментов для заголовков, списков и выделения.',
  onChangeHtml,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: !editable,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: 'text-primary underline underline-offset-2' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: {
        class:
          'sermon-doc-editor prose prose-stone max-w-none min-h-[55dvh] px-1 py-2 text-[16px] leading-7 text-stone-900 focus:outline-none sm:px-2',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChangeHtml(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = initialHtml || '';
    if (current === next) return;
    // Avoid clobbering while user types — only sync when content externally replaced.
    if (editor.isFocused) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, initialHtml]);

  if (!editor) {
    return <div className="min-h-[40dvh] animate-pulse rounded-xl bg-stone-100" />;
  }

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Ссылка', prev || 'https://');
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editable ? (
        <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-0.5 rounded-xl border border-stone-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
          <ToolbarButton
            title="Отменить"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <LuUndo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Повторить"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <LuRedo2 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-stone-200" />
          <ToolbarButton
            title="Жирный"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <LuBold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Курсив"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <LuItalic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Подчёркнутый"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <LuUnderline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Зачёркнутый"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <LuStrikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Выделение"
            active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <LuHighlighter className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-stone-200" />
          <ToolbarButton
            title="Заголовок 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <LuHeading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Заголовок 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <LuHeading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Заголовок 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <LuHeading3 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-stone-200" />
          <ToolbarButton
            title="Маркированный список"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <LuList className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Нумерованный список"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <LuListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Список задач"
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <LuListChecks className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Цитата"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <LuQuote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Разделитель" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <LuMinus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Ссылка" active={editor.isActive('link')} onClick={setLink}>
            <LuLink className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-stone-200" />
          <ToolbarButton
            title="По левому краю"
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <LuAlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="По центру"
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <LuAlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="По правому краю"
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <LuAlignRight className="h-4 w-4" />
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
