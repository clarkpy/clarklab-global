import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function registerErrorHandler(app: { onError: (handler: (err: Error, c: Context) => Response | Promise<Response>) => void }) {
  app.onError((err, c) => {
    const pgCode = (err as { code?: string }).code
    if (pgCode === '23505') {
      return c.json({ error: 'Resource already exists', code: pgCode }, 409)
    }
    if (pgCode === '23503') {
      return c.json({ error: 'Referenced resource not found', code: pgCode }, 400)
    }
    console.error(err)
    const status = (err as { status?: ContentfulStatusCode }).status ?? 500
    return c.json(
      { error: err.message || 'Internal server error', code: pgCode ?? 'internal_error' },
      status,
    )
  })
}
