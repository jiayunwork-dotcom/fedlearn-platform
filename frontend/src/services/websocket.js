export class ExperimentWebSocket {
  constructor(experimentId, callbacks = {}) {
    this.experimentId = experimentId
    this.callbacks = callbacks
    this.ws = null
    this.reconnectTimer = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/experiment/${this.experimentId}`

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        if (this.callbacks.onOpen) {
          this.callbacks.onOpen()
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data)
          }
          this.handleMessage(data)
        } catch (e) {
          console.error('WebSocket parse error:', e)
        }
      }

      this.ws.onerror = (error) => {
        if (this.callbacks.onError) {
          this.callbacks.onError(error)
        }
      }

      this.ws.onclose = () => {
        if (this.callbacks.onClose) {
          this.callbacks.onClose()
        }
        this.scheduleReconnect()
      }
    } catch (e) {
      console.error('WebSocket connection error:', e)
      this.scheduleReconnect()
    }
  }

  handleMessage(data) {
    const { type } = data
    if (this.callbacks[type]) {
      this.callbacks[type](data)
    }
    const onType = 'on' + type.charAt(0).toUpperCase() + type.slice(1)
    if (this.callbacks[onType]) {
      this.callbacks[onType](data)
    }
    if (data.status) {
      const statusType = data.status
      if (this.callbacks[statusType]) {
        this.callbacks[statusType](data)
      }
      const onStatus = 'on' + statusType.charAt(0).toUpperCase() + statusType.slice(1)
      if (this.callbacks[onStatus]) {
        this.callbacks[onStatus](data)
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export function createWebSocket(experimentId, callbacks) {
  const ws = new ExperimentWebSocket(experimentId, callbacks)
  ws.connect()
  return ws
}
