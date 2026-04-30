import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

const TRANSITION_MS = 150;

export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const [displayedOutlet, setDisplayedOutlet] = useState(outlet);
  const [isExiting, setIsExiting] = useState(false);
  const prevPathRef = useRef(`${location.pathname}${location.search}`);

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`;
    if (nextPath === prevPathRef.current) return;

    prevPathRef.current = nextPath;
    setIsExiting(true);

    const t = setTimeout(() => {
      setDisplayedOutlet(outlet);
      setIsExiting(false);
    }, TRANSITION_MS);

    return () => clearTimeout(t);
  }, [location.pathname, location.search, outlet]);

  return (
    <div className={`route-transition ${isExiting ? 'route-transition-exit' : 'route-transition-enter'}`}>
      {displayedOutlet}
    </div>
  );
}
