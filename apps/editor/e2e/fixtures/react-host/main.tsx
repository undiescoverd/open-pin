import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

/* A React app that embeds a Waypost guide the way a product's help pages would: the guide appears when its page opens, survives
   re-renders, and goes when the person navigates away. The test builds it with Vite. */

const params = new URLSearchParams(location.search);
const guide = params.get('guide') ?? '';
const player = params.get('player') ?? '';

function App() {
  const [page, setPage] = useState<'home' | 'guide'>('home');
  const [renders, setRenders] = useState(0);
  return (
    <main>
      <nav>
        <button type="button" onClick={() => setPage('home')}>
          Home
        </button>
        <button type="button" onClick={() => setPage('guide')}>
          Guide
        </button>
        <button type="button" onClick={() => setRenders(n => n + 1)}>
          Re-render {renders}
        </button>
      </nav>
      {page === 'home' ? (
        <p>Welcome.</p>
      ) : (
        <section>
          <h1>Connect your calendar</h1>
          <div data-waypost={guide} data-renders={renders} />
        </section>
      )}
    </main>
  );
}

/* the player script, added once as an app would in its HTML */
const script = document.createElement('script');
script.src = player;
script.async = true;
document.head.append(script);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
