import { useEffect } from 'react';
import Layout from './components/Layout';
import { Link, Problem } from './components/ui';
import { matchRoute, usePath } from './lib/router';
import Connecting from './pages/Connecting';
import Home from './pages/Home';
import ResultsPage from './pages/ResultsPage';
import SharePage from './pages/SharePage';
import { APP_NAME } from './config';

export default function App() {
  const route = matchRoute(usePath());

  useEffect(() => {
    document.title = route.page === 'result' ? `Results · ${APP_NAME}` : APP_NAME;
  }, [route.page]);

  let page;
  switch (route.page) {
    case 'home':
      page = <Home />;
      break;
    case 'callback':
      page = <Connecting />;
      break;
    case 'share':
      page = <SharePage key={route.id} id={route.id} />;
      break;
    case 'result':
      page = <ResultsPage key={`${route.id}/${route.joinId}`} id={route.id} joinId={route.joinId} />;
      break;
    default:
      page = (
        <Problem title="Page not found" message="That address doesn't go anywhere.">
          <Link href="/" className="btn-primary">
            Go home
          </Link>
        </Problem>
      );
  }
  return <Layout>{page}</Layout>;
}
