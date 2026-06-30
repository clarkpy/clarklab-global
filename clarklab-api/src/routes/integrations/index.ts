import { Hono } from 'hono'
import { githubIntegrationRoutes } from './github.js'

export const integrationRoutes = new Hono()

integrationRoutes.route('/github', githubIntegrationRoutes)