import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

/** 通用异步加载 hook */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fn())
      .then((data) => { if (alive) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (alive) setState({ data: null, loading: false, error: err.message || '加载失败' }); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, deps);
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

/** 翻页列表加载 */
export function usePaged(fetcher, deps = []) {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetcher(p);
      setList(res.list || []);
      setTotal(res.total || 0);
      setPage(p);
    } finally { setLoading(false); }
  }, // eslint-disable-next-line
    deps);

  useEffect(() => { load(1); }, [load]);
  return { list, total, page, loading, setPage, load };
}

export { api };
