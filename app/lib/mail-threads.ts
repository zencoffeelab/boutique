export function groupMailThreads<T extends { id: string; parent_id?: string | null; created_at: string }>(messages: T[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const groups = new Map<string, T[]>();
  for (const message of messages) {
    let root = message;
    const visited = new Set<string>();
    while (root.parent_id && byId.has(root.parent_id) && !visited.has(root.id)) {
      visited.add(root.id);
      root = byId.get(root.parent_id)!;
    }
    groups.set(root.id, [...(groups.get(root.id) ?? []), message]);
  }
  return [...groups.entries()].map(([id, thread]) => ({ id, messages: thread.toSorted((a, b) => a.created_at.localeCompare(b.created_at)) })).toSorted((a, b) => b.messages.at(-1)!.created_at.localeCompare(a.messages.at(-1)!.created_at));
}
