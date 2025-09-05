import React, { useEffect, useMemo, useState } from 'react'

export default function WikiPanel({ state }) {
  if (state.status === 'idle')    return <p className="muted">Search a place to see Wikipedia results.</p>
  if (state.status === 'loading') return <p className="muted">Loading Wikipedia…</p>
  if (state.status === 'error')   return <p className="muted">Couldn’t load Wikipedia info.</p>

  const pool = state.pool || []
  const [offset, setOffset] = useState(0) // rotates the 4 “extras” only

  useEffect(() => { setOffset(0) }, [pool.length, pool[0]?.title])

  const visible = useMemo(() => {
    if (!pool.length) return []
    const primary = pool[0]
    const extras = pool.slice(1)
    if (extras.length <= 4) return pool.slice(0, 5)
    const start = offset % extras.length
    const rotated = extras.slice(start, start + 4)
      .concat(start + 4 > extras.length ? extras.slice(0, (start + 4) % extras.length) : [])
      .slice(0, 4)
    return [primary, ...rotated]
  }, [pool, offset])

  const canCycle = (pool.length - 1) > 4

  return (
    <>
      <div className="controls">
        <button
          className="btn"
          onClick={() => setOffset(o => o + 4)}
          disabled={!canCycle}
          aria-disabled={!canCycle}
          title={canCycle ? "Show different nearby articles" : "No more nearby items"}
        >
          More nearby
        </button>
      </div>

      {visible.length ? (
        <ol className="wiki-list">
          {visible.map((s, idx) => (
            <li key={s.title} className={idx === 0 ? 'primary' : undefined}>
              <a
                href={s.content_urls?.desktop?.page || s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="wiki-item"
              >
                {s.thumbnail?.source && (
                  <img src={s.thumbnail.source} alt={s.title} className="thumb" />
                )}
                <div className="meta">
                  <div className="title-row">
                    <h3 className="title">
                      {idx === 0 && <span className="badge">Primary</span>} {s.title}
                    </h3>
                    {(s._badge || s.description) && (
                      <span className="tag">{s._badge || s.description}</span>
                    )}
                    {typeof s._distKm === 'number' && (
                      <span className="tag muted-tag">{s._distKm.toFixed(1)} km</span>
                    )}
                  </div>
                  <p className="desc">{s.extract || s.description || 'No summary available.'}</p>
                </div>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No articles found.</p>
      )}
    </>
  )
}
