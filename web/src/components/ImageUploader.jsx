import { useRef, useState } from 'react';
import { upload } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Spinner } from './ui.jsx';

export default function ImageUploader({
  value = [],
  onChange,
  max = 6,
  purpose = 'general',
  single = false,
  label = '上传图片',
  hint = '支持 JPG / PNG / WebP，单张不超过 8MB',
  compact = false,
}) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast.error('请选择图片文件');
      return;
    }
    const room = single ? 1 : max - value.length;
    if (room <= 0) {
      toast.error(`最多上传 ${max} 张图片`);
      return;
    }
    for (const file of list.slice(0, room)) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} 超过 8MB，已跳过`);
        continue;
      }
      try {
        setProgress(0);
        const result = await upload(file, purpose, setProgress);
        const next = [...(single ? [] : value), result];
        onChange?.(next);
      } catch (err) {
        toast.error(err.message || '上传失败');
      } finally {
        setProgress(null);
      }
    }
  };

  const remove = (id) => onChange?.(value.filter((v) => v.id !== id));

  return (
    <div className="stack gap-12">
      {value.length > 0 && (
        <div className="thumb-row">
          {value.map((img) => (
            <div className="thumb" key={img.id}>
              <img src={img.thumbUrl || img.url} alt="已上传图片预览" />
              <button type="button" className="thumb__del" onClick={() => remove(img.id)} aria-label="移除这张图片">
                ×
              </button>
            </div>
          ))}
          {!single && value.length < max && (
            <button type="button" className="thumb thumb--add" onClick={() => inputRef.current?.click()}>
              + 继续添加
            </button>
          )}
        </div>
      )}

      {value.length === 0 && (
        <div
          className={`dropzone ${drag ? 'is-drag' : ''}`}
          style={compact ? { minHeight: 120, padding: 16 } : undefined}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          aria-label={label}
        >
          <div className="dropzone__icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="dropzone__title">{progress !== null ? '正在上传…' : label}</div>
          <div className="dropzone__hint">{hint}</div>
          {progress !== null && (
            <div style={{ width: 180, marginTop: 6 }}>
              <div className="progress"><div className="progress__bar" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
        </div>
      )}

      {progress !== null && value.length > 0 && (
        <div className="row gap-12 small muted"><Spinner /> 正在上传第 {value.length + 1} 张…</div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={!single}
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
