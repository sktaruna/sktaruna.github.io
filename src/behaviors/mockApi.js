// Dummy async "actions" the behavior engine calls — no real network requests,
// deterministic-ish logic standing in for backend integrations.

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockApi = {
  async lookupOrder({ order_id }) {
    await delay(1100)
    const id = (order_id || '').trim().toUpperCase()
    if (!id.startsWith('ORD')) return { outcome: 'not_found', data: {} }
    const order_status = id.includes('999') ? 'in_transit' : 'processing'
    return {
      outcome: 'found',
      data: {
        order_id: id,
        order_status,
        item_name: 'Wireless Headphones - Black',
        current_date: 'July 21, 2026',
      },
    }
  },

  async checkSlot({ item }) {
    await delay(450)
    const available = !item.endsWith('27')
    return { available, detail: available ? 'Open' : 'Carrier at capacity' }
  },

  async rescheduleOrder() {
    await delay(1000)
    return { outcome: 'success', data: {} }
  },

  async getAccountStatus() {
    await delay(500)
    return { data: { account_status: 'Good standing, no holds' }, detail: 'Good standing' }
  },

  async getRecentTickets() {
    await delay(500)
    return { data: { recent_tickets: 'None in the last 90 days' }, detail: '0 open tickets' }
  },
}
