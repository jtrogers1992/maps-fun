import { useEffect, useMemo, useState } from 'react'

function wikiUrl(s) {
  // Prefer REST-provided URLs, but fall back to canonical /wiki/Title
  const fromRest =
    s?.content_urls?.desktop?.page ||
    s?.content_urls?.mobile?.page ||
    s?.url
  if (fromRest) return fromRest
  if (s?.title) {
    const slug = encodeURIComponent((s.title || '').replace(/ /g, '_'))
    return `https://en.wikipedia.org/wiki/${slug}`
  }
  return '#'
}

export default function WikiPanel(props) {
  // Safely handle the case where props might be undefined
  const state = props ? props.state : { status: 'idle', pool: [] };
  if (state.status === 'idle')    return <p className="muted">Search a place to see Wikipedia results.</p>
  if (state.status === 'loading') return (
    <div className="loading-container">
      <p className="muted">Loading Wikipedia articles...</p>
      <div className="loading-spinner"></div>
      <p className="muted small">This may take a moment</p>
    </div>
  )
  if (state.status === 'error')   return <p className="muted">Couldn’t load Wikipedia info.</p>

  const pool = state.pool || []
  const [offset, setOffset] = useState(0) // rotates the 4 “extras” only

  // Reset offset when the pool changes (new place)
  useEffect(() => { setOffset(0) }, [pool.length, pool[0]?.title])

  const visible = useMemo(() => {
    if (!pool.length) return []
    const primary = pool.find(x => x._isPrimary)
    const extras = primary ? pool.filter(x => x !== primary) : pool
    
    // If we have 4 or fewer extras, show all of them plus primary if it exists
    if (extras.length <= 4) return primary ? [primary, ...extras] : extras.slice(0, 5)
    
    // For more than 4 extras, we need to rotate and show 4 of them plus primary
    const start = offset % extras.length
    const rotated = extras.slice(start, start + 4)
      .concat(start + 4 > extras.length ? extras.slice(0, (start + 4) % extras.length) : [])
      .slice(0, primary ? 4 : 5) // Show 4 if we have primary, 5 if we don't
    
    return primary ? [primary, ...rotated] : rotated
  }, [pool, offset])

  const canCycle = (pool.filter(x => !x._isPrimary).length) > 4

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
          {visible.map((s) => (
            <li key={s.title} className={s._isPrimary ? 'primary' : undefined}>
              <a
                href={wikiUrl(s)}
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
                      {s._isPrimary && <span className="badge">Primary</span>} {s.title}
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
