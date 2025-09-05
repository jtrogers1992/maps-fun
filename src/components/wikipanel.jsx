import React from 'react'

export default function WikiPanel({ state }) {
  if (state.status === 'idle') {
    return <p className="muted">Search a place to see the nearest Wikipedia article.</p>
  }
  if (state.status === 'loading') {
    return <p className="muted">Loading Wikipedia…</p>
  }
  if (state.status === 'error') {
    return <p className="muted">Couldn’t load Wikipedia info.</p>
  }
  if (state.status === 'empty') {
    return <p className="muted">No nearby Wikipedia article found.</p>
  }
  const summary = state.data
  if (!summary) return <p className="muted">No information available.</p>

  return (
    <div className="wiki">
      <h2>{summary.title}</h2>
      {summary.thumbnail?.source && (
        <img src={summary.thumbnail.source} alt={summary.title} />
      )}
      <p>{summary.extract || 'No summary available.'}</p>
      <p>
        <a
          href={summary.content_urls?.desktop?.page || summary.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read on Wikipedia →
        </a>
      </p>
    </div>
  )
}
