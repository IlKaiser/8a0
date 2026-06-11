import Draft from './screens/Draft';
import FormationPick from './screens/FormationPick';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Tournament from './screens/Tournament';
import { useRoom } from './useRoom';

export default function App() {
  const api = useRoom();
  const { snap, error } = api;
  return (
    <div className="app">
      {error && <div className="toast" role="alert">{error}</div>}
      {!snap && <Home api={api} />}
      {snap?.phase === 'lobby' && <Lobby api={api} snap={snap} />}
      {snap?.phase === 'formation' && <FormationPick api={api} snap={snap} />}
      {snap?.phase === 'draft' && <Draft api={api} snap={snap} />}
      {(snap?.phase === 'tournament' || snap?.phase === 'results') && (
        <Tournament api={api} snap={snap} />
      )}
    </div>
  );
}
