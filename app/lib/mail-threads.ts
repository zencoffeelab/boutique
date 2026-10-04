type ThreadableMail = {
  id: string;
  parent_id?: string | null;
  message_id_header?: string | null;
  in_reply_to_header?: string | null;
  references_header?: string | null;
  created_at: string;
};

function messageIdTokens(value: string | null | undefined) {
  if (!value) return [];
  const bracketed = [...value.matchAll(/<[^<>\s]+>/g)].map((match) => match[0]);
  return bracketed.length > 0 ? bracketed : value.split(/\s+/).filter(Boolean);
}

export function splitQuotedMailHistory(value: string | null | undefined) {
  if (!value) return { body: value, quotedHistory: null };
  const quotedHistory = /(?:^|\n)(?:(?:Le|On)\s[\s\S]{0,800}?(?:a\s+écrit|wrote)\s*:|-----Original Message-----)\s*(?:\n|$)/i;
  const match = quotedHistory.exec(value);
  if (!match) return { body: value, quotedHistory: null };
  const quotedPart = value.slice(match.index).trim();
  return { body: value.slice(0, match.index).trimEnd(), quotedHistory: quotedPart };
}

export function withoutQuotedMailHistory(value: string | null | undefined) {
  return splitQuotedMailHistory(value).body;
}

export function groupMailThreads<T extends ThreadableMail>(messages: T[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const byMessageId = new Map(messages.flatMap((message) => messageIdTokens(message.message_id_header).map((header) => [header, message])));
  const parentFor = (message: T) => {
    if (message.parent_id && byId.has(message.parent_id)) return byId.get(message.parent_id)!;
    const headerCandidates = [
      ...messageIdTokens(message.in_reply_to_header),
      ...messageIdTokens(message.references_header).reverse(),
    ];
    return headerCandidates.map((header) => byMessageId.get(header)).find(Boolean) ?? null;
  };
  const groups = new Map<string, T[]>();
  for (const message of messages) {
    let root = message;
    const visited = new Set<string>();
    let parent = parentFor(root);
    while (parent && !visited.has(root.id)) {
      visited.add(root.id);
      root = parent;
      parent = parentFor(root);
    }
    groups.set(root.id, [...(groups.get(root.id) ?? []), message]);
  }
  return [...groups.entries()].map(([id, thread]) => ({ id, messages: thread.toSorted((a, b) => a.created_at.localeCompare(b.created_at)) })).toSorted((a, b) => b.messages.at(-1)!.created_at.localeCompare(a.messages.at(-1)!.created_at));
}
