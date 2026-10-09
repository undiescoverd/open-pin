import { lazy, Suspense } from 'react';
import { EditorShell } from './editor/EditorShell';

/* /kit is the component gallery; it loads separately so the editor never ships it up front */
const KitPage = lazy(() => import('./kit/KitPage'));

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/kit')
    return (
      <Suspense fallback={null}>
        <KitPage />
      </Suspense>
    );
  return <EditorShell />;
}
