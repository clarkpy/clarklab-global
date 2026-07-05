import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'

type ErrorHandlerApp = {
  onError: (
    handler: (err: Error, c: Context) => Response | Promise<Response>,
  ) => void
}

export function registerErrorHandler(app:ErrorHandlerApp) {
  app.onError(async (err, c) => {
    const pgCode = (err as {code?: string}).code

    if (err instanceof ZodError) {
      return c.json({ error: 'Invalid request data', code: 'invalid_request' }, 400)
    }

    if (pgCode === '23505') {
      return c.json({ error: 'Resource already exists', code: 'resource_exists' }, 409)
    }

    if (pgCode === '23503') {
      return c.json({ error: 'Resource not found', code: 'invalid_reference' }, 404)
    }

    if (
      pgCode === '23502' || pgCode === '23514' || pgCode === '22P02'
    ) {
      return c.json({ error: 'Invalid request payload', code: 'invalid_request' }, 400)
    }

    console.error('Unhandled error:', err)
    return c.json({ error: 'Internal server error', code: 'internal_error' }, 500)
  })
}