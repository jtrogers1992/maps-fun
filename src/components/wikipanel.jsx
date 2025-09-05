import React from 'react'

export default function WikiPanel({ state }) {
  if (state.status === 'idle')   return <p className="muted">Search a place to see Wikipedia results.</p>
  if (state.status === 'loading')return <p className="muted">Loading Wikipedia…</p>
  if (state.status === 'error')  return <p className="muted">Couldn’t load Wikipedia info.</p>

  const items = state.items || []
  if (!items.length) return <p className="muted">No articles found.</p>

  return (
    <ol className="wiki-list">
      {items.map((s, idx) => (
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
  )
}
