import '@testing-library/jest-dom'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  
  private messageQueue: string[] = []

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 10)
  }

  send(data: string) {
    this.messageQueue.push(data)
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  // Test helpers
  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  getLastSentMessage() {
    return this.messageQueue[this.messageQueue.length - 1]
  }

  getSentMessages() {
    return [...this.messageQueue]
  }
}

// @ts-expect-error - replacing global WebSocket for tests
global.WebSocket = MockWebSocket

// Mock fetch
global.fetch = vi.fn()

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})
