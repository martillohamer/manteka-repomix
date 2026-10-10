const subscribers: Map<AgentRole, Array<(message: import('./types.js').AgentMessage) => void>> = new Map();

export const SwarmEventBus = {
  subscribe(role: AgentRole, handler: (message: import('./types.js').AgentMessage) => void) {
    if (!subscribers.has(role)) {
      subscribers.set(role, []);
    }
    subscribers.get(role)!.push(handler);
  },

  publish(message: import('./types.js').AgentMessage) {
    const handlers = subscribers.get(message.role) || [];
    handlers.forEach((handler) => {
      try {
        handler(message);
      } catch (_e) {
        // Resiliente: fallos en un handler no rompen el bus
      }
    });
  },

  getSubscribers(role: AgentRole) {
    return subscribers.get(role)?.length || 0;
  },

  reset() {
    subscribers.clear();
  },
};
