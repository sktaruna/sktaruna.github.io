// A dummy "Reschedule Delivery" flow expressed in the 11-behavior vocabulary
// (collect, action, choice, confirm, guide, investigate, if, escalate, done,
// while, foreach) — walked node-by-node by useBehaviorEngine. Every behavior
// is exercised at least once; `while`'s body embeds the guide composition,
// per the original spec's own schema (guide/collect nested inside while.body).

export const RESCHEDULE_FLOW = {
  entry: 'welcome_choice',
  initialDatapoints: {
    candidate_dates: ['2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28'],
  },
  nodes: [
    {
      slug: 'welcome_choice',
      behavior: 'choice',
      prompt: 'What would you like to do?',
      options: [
        { label: 'Reschedule delivery', subtitle: 'Pick a new date that works for you', goto: 'collect_order_id' },
        { label: 'Speak to a human agent', subtitle: 'Connect with support team', goto: 'investigate_before_escalate' },
      ],
    },
    {
      slug: 'collect_order_id',
      behavior: 'collect',
      prompt: "Let's find your order. Please enter your Order ID below.",
      hints: ['From email', 'My Orders'],
      field: { name: 'order_id', placeholder: 'e.g. ORD-2026-78432' },
      goto: 'lookup_order',
    },
    {
      slug: 'lookup_order',
      behavior: 'action',
      loadingMessage: 'Looking up your order...',
      call: 'lookupOrder',
      outcomes: { found: 'check_status', not_found: 'order_not_found' },
      outcomeRender: {
        found: {
          badge: { label: 'Found', state: 'success' },
          lines: ['Order #{{order_id}}', '{{item_name}}', 'Est. Delivery: {{current_date}}'],
        },
        not_found: {
          badge: { label: 'Not Found', state: 'error' },
          lines: ["We couldn't find an order with that ID."],
        },
      },
    },
    {
      slug: 'order_not_found',
      behavior: 'escalate',
      reason: "We couldn't locate an order with that ID — a support agent can help track it down.",
      rows: [],
      terminal: true,
    },
    {
      slug: 'check_status',
      behavior: 'if',
      condition: "order_status in ['in_transit','delivered','cancelled']",
      then: 'not_eligible',
      else: 'check_slots',
      thenInfo: { badge: { label: 'Not Eligible', state: 'error' }, text: 'Your order status is "{{order_status}}", so it can no longer be rescheduled through this channel.' },
      elseInfo: { badge: { label: 'Eligible', state: 'success' }, text: 'Great news! Your order is currently "{{order_status}}", so it can be rescheduled. Let me fetch the available delivery slots for you.' },
    },
    {
      slug: 'not_eligible',
      behavior: 'escalate',
      reason: 'Your order status changed, so the reschedule can no longer be completed automatically.',
      rows: [
        { label: 'Order ID', valueField: 'order_id' },
        { label: 'Status', valueField: 'order_status' },
      ],
      terminal: true,
    },
    {
      slug: 'check_slots',
      behavior: 'foreach',
      title: 'Checking available delivery slots...',
      collection: 'candidate_dates',
      call: 'checkSlot',
      resultField: 'available_slots',
      goto: 'collect_new_date',
    },
    {
      slug: 'collect_new_date',
      behavior: 'while',
      firstPrompt: 'What new date works for you?',
      collectField: { name: 'chosen_date', placeholder: 'e.g. 2026-07-25' },
      chipsField: 'available_slots',
      invalidMessage: 'That date does not match any available slots.',
      successCondition: 'chosen_date in available_slots',
      maxIterations: 3,
      successGoto: 'confirm_reschedule',
      maxGoto: 'escalate_to_human',
    },
    {
      slug: 'escalate_to_human',
      behavior: 'escalate',
      reason: "That still doesn't match an available slot after a few tries — let's get you to a person.",
      rows: [
        { label: 'Order ID', valueField: 'order_id' },
        { label: 'Attempts', value: '3 of 3' },
      ],
      terminal: true,
    },
    {
      slug: 'confirm_reschedule',
      behavior: 'confirm',
      title: 'Please confirm before I proceed',
      rows: [
        { label: 'Order ID', valueField: 'order_id' },
        { label: 'Current Date', valueField: 'current_date' },
        { label: 'New Date', valueField: 'chosen_date', highlight: true },
        { label: 'Item', valueField: 'item_name' },
      ],
      actions: [
        { label: 'Confirm & Reschedule', style: 'success', goto: 'do_reschedule' },
        { label: 'Change Date', style: 'outline', goto: 'collect_new_date' },
      ],
    },
    {
      slug: 'do_reschedule',
      behavior: 'action',
      loadingMessage: 'Rescheduling your delivery...',
      call: 'rescheduleOrder',
      outcomes: { success: 'done_success' },
      outcomeRender: {
        success: { badge: { label: 'Rescheduled', state: 'success' }, lines: ['Reschedule request submitted successfully.'] },
      },
    },
    {
      slug: 'done_success',
      behavior: 'done',
      title: 'Reschedule Confirmed!',
      message: 'Your delivery has been successfully rescheduled.',
      rows: [
        { label: 'Order ID', valueField: 'order_id' },
        { label: 'New Delivery Date', valueField: 'chosen_date', highlight: true },
        { label: 'Confirmation', value: 'Sent to your email' },
      ],
      collectRating: true,
      terminal: true,
    },
    {
      slug: 'investigate_before_escalate',
      behavior: 'investigate',
      title: 'Checking your account...',
      checks: [
        { label: 'Account Status', call: 'getAccountStatus' },
        { label: 'Recent Tickets', call: 'getRecentTickets' },
      ],
      goto: 'escalate_direct',
    },
    {
      slug: 'escalate_direct',
      behavior: 'escalate',
      reason: "I'm connecting you with a human agent now.",
      rows: [
        { label: 'Account Status', valueField: 'account_status' },
        { label: 'Recent Tickets', valueField: 'recent_tickets' },
      ],
      terminal: true,
    },
  ],
}
