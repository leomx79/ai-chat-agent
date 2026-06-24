/**
 * local server entry file, for local development
 */
import app from './app.js'
import { initWebSocket } from './ws/handler.js'

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log(`WebSocket ready on ws://localhost:${PORT}/ws`)
})

// 初始化 WebSocket
initWebSocket(server)

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
