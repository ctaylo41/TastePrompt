// Rolling 60-second token usage tracker
const events = [] // { ts: number, tokens: number }
const listeners = new Set()

export function recordTokens(tokens) {
  events.push({ ts: Date.now(), tokens })
  notify()
}

export function getUsagePerMinute() {
  const cutoff = Date.now() - 60_000
  // Drop old events
  while (events.length && events[0].ts < cutoff) events.shift()
  return events.reduce((sum, e) => sum + e.tokens, 0)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn(getUsagePerMinute()))
}
