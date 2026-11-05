import { Fragment } from 'react';

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

/** 轻量 Markdown 渲染：仅支持标题、列表、段落、加粗，够用且无外部依赖 */
export default function Markdown({ content }) {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  let list = null;
  let ordered = false;

  const flush = () => {
    if (list) {
      blocks.push(
        ordered ? (
          <ol key={`l${blocks.length}`}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ol>
        ) : (
          <ul key={`l${blocks.length}`}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>
        ),
      );
      list = null;
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flush();
      return;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push(<h3 key={idx}>{inline(line.slice(4))}</h3>);
      return;
    }
    if (line.startsWith('## ')) {
      flush();
      blocks.push(<h2 key={idx}>{inline(line.slice(3))}</h2>);
      return;
    }
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      if (list && !ordered) flush();
      ordered = true;
      list = list || [];
      list.push(ol[2]);
      return;
    }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (list && ordered) flush();
      ordered = false;
      list = list || [];
      list.push(ul[1]);
      return;
    }
    flush();
    blocks.push(<p key={idx}>{inline(line)}</p>);
  });
  flush();

  return <div className="prose">{blocks}</div>;
}
