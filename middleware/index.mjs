// middleware/index.mjs
import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import timeout from 'connect-timeout'
import { inject } from '@vercel/analytics'
import path from 'path'

export function setupMiddleware(app, __dirname) {
  app.use(cors())
  app.use(timeout('90s'))
  app.use(bodyParser.json())
  app.use(express.static('public'))
  app.use(express.static(path.join(__dirname, 'public')))
  app.use(express.urlencoded({ extended: true }))
  inject()
}
