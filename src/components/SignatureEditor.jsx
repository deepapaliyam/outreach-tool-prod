import React, { useRef, useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Palette, List, ListOrdered, Link as LinkIcon, Unlink,
  ImagePlus, Minus, AlignLeft, AlignCenter, Eraser, Undo2, Redo2, Wand2,
} from 'lucide-react';
import { normalizeUrl, hostLabel } from '../lib/signature';
import { checkLogoFile } from '../lib/db';
import { Spinner } from './ui';

// A logo can be sized with these (pixels wide). Without a size it is capped at 200.
const LOGO_SIZES = [['S', 80], ['M', 120], ['L', 180]];

const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => el.getAttribute('width'),
        renderHTML: attrs => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },
});

function Tool({ label, onClick, active, disabled, children }) {
  return (
    <button type="button" className={active ? 'on' : ''} aria-label={label} title={label} aria-pressed={active ? true : undefined}
      disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
  );
}

// The signature box: a small rich-text editor (bold, colours, links, logo...) whose
// output is HTML. It is saved as-is and cleaned again on the server when sent.
export default function SignatureEditor({ value, onChange, getStarter, uploadLogo, notify }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const lastEmitted = useRef(value || '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false }),
      Underline, TextStyle, Color,
      TextAlign.configure({ types: ['paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'], HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      SizedImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Your name, title, company, phone, links… or press “Build from my details”.' }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty && !ed.getHTML().includes('<img') ? '' : ed.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // The box is edited in place, but the page can also change it from outside
  // (Remove signature, a fresh save). Those changes are pushed into the editor.
  useEffect(() => {
    if (editor && (value || '') !== lastEmitted.current) {
      lastEmitted.current = value || '';
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return <div className="sig-wrap" style={{ minHeight: 220 }} />;

  const imageSelected = editor.isActive('image');
  const chain = () => editor.chain().focus();

  const applyLink = () => {
    const url = normalizeUrl(linkUrl);
    if (!url) { notify({ tone: 'warn', title: 'That doesn\'t look like a web address', text: 'Use something like northstar.studio or https://northstar.studio/work' }); return; }
    const { from, to } = editor.state.selection;
    if (from === to && !editor.isActive('link')) {
      chain().insertContent({ type: 'text', text: hostLabel(url), marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else {
      chain().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkOpen(false); setLinkUrl('');
  };

  const openLink = () => {
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkOpen(v => !v);
  };

  const pickLogo = async (file) => {
    const problem = checkLogoFile(file);
    if (problem) { notify({ tone: 'warn', title: 'Logo not added', text: problem }); return; }
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      chain().setImage({ src: url, alt: 'Logo' }).run();
    } catch (e) {
      notify({ tone: 'bad', title: 'Logo upload failed', text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const build = () => {
    const html = getStarter();
    if (!html) { notify({ tone: 'warn', title: 'Nothing to build from yet', text: 'Fill in your name, title, company and contact details above first.' }); return; }
    const hasText = !editor.isEmpty;
    if (hasText && !window.confirm('Replace what is in the signature box with a fresh one built from your details?')) return;
    editor.commands.setContent(html, true);
  };

  const setWidth = (w) => chain().updateAttributes('image', { width: w }).run();
  const used = (value || '').length;

  return (
    <div>
      <div className="sig-wrap sig-edit">
        <div className="sig-tools" role="toolbar" aria-label="Signature formatting">
          <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><Bold size={15} /></Tool>
          <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><Italic size={15} /></Tool>
          <Tool label="Underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon size={15} /></Tool>
          <Tool label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Tool>
          <span className="color" title="Text colour">
            <Tool label="Text colour" onClick={() => {}}><Palette size={15} /></Tool>
            <input type="color" aria-label="Text colour picker" value={editor.getAttributes('textStyle').color || '#222222'} onChange={e => chain().setColor(e.target.value).run()} />
          </span>
          <span className="sep" />
          <Tool label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={15} /></Tool>
          <Tool label="Align centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={15} /></Tool>
          <Tool label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}><List size={15} /></Tool>
          <Tool label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={15} /></Tool>
          <span className="sep" />
          <Tool label="Add or edit link" active={editor.isActive('link') || linkOpen} onClick={openLink}><LinkIcon size={15} /></Tool>
          <Tool label="Remove link" disabled={!editor.isActive('link')} onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink size={15} /></Tool>
          <Tool label="Upload logo or image" disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? <Spinner size={14} /> : <ImagePlus size={15} />}</Tool>
          <Tool label="Divider line" onClick={() => chain().setHorizontalRule().run()}><Minus size={15} /></Tool>
          <Tool label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}><Eraser size={15} /></Tool>
          <span className="sep" />
          <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 size={15} /></Tool>
          <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 size={15} /></Tool>
          <span className="grow" />
          <button type="button" className="btn sm" onMouseDown={e => e.preventDefault()} onClick={build}><Wand2 size={13} /> Build from my details</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Logo file" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickLogo(f); }} />
        </div>
        {linkOpen && (
          <div className="link-pop">
            <input type="url" aria-label="Link address" autoFocus placeholder="https://your-site.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }} />
            <button type="button" className="btn sm primary" onClick={applyLink}>Apply link</button>
            <button type="button" className="btn sm" onClick={() => setLinkOpen(false)}>Cancel</button>
          </div>
        )}
        {imageSelected && (
          <div className="link-pop" style={{ background: 'var(--brand-50)', borderColor: 'var(--brand-100)' }}>
            <span className="small strong">Logo size</span>
            {LOGO_SIZES.map(([label, w]) => (
              <button key={label} type="button" className={`btn sm${String(editor.getAttributes('image').width) === String(w) ? ' primary' : ''}`} onClick={() => setWidth(w)}>{label} · {w}px</button>
            ))}
            <button type="button" className="btn sm danger" onClick={() => chain().deleteSelection().run()}>Remove image</button>
          </div>
        )}
        <EditorContent editor={editor} />
        <div className="sig-foot">
          <span>Logo: PNG, JPG, GIF or WebP, under 512 KB. Select the image to resize it.</span>
          <span className={used > 18000 ? 'strong' : ''} style={used > 18000 ? { color: 'var(--bad)' } : undefined}>{used.toLocaleString()} / 20,000 characters</span>
        </div>
      </div>
    </div>
  );
}
