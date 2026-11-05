import { Breadcrumbs } from './ui.jsx';

export default function PageHead({ items, title, desc, actions, children }) {
  return (
    <div className="page-head">
      <div className="container">
        <Breadcrumbs items={items} />
        <h1 className="page-head__title">{title}</h1>
        {desc && <p className="page-head__desc">{desc}</p>}
        {actions && <div className="page-head__actions">{actions}</div>}
        {children}
      </div>
    </div>
  );
}
