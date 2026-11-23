export type QueueActor = {
  id: string;
  role: 'resident' | 'technician';
};

export type QueueStatus = 'open' | 'in_progress' | 'resolved';
export type QueueCategory = 'plumbing' | 'electrical' | 'furniture' | 'other';

export type QueueFilters = {
  status: QueueStatus | null;
  category: QueueCategory | null;
  limit: number;
  offset: number;
};

export type QueueItem = {
  id: string;
  residentId: string;
  assigneeId: string | null;
  location: string;
  category: QueueCategory;
  description: string;
  status: QueueStatus;
  createdAt: string;
};

export type QueueSelection = QueueFilters & {
  ownerId: string | null;
};

export interface QueueReader {
  /** Filter by owner when present and sort by createdAt DESC, id DESC before pagination. */
  read(selection: QueueSelection): Promise<QueueItem[]>;
}

export function createRepairQueue(reader: QueueReader) {
  return {
    async list(
      actor: QueueActor,
      filters: QueueFilters,
    ): Promise<{ items: QueueItem[] }> {
      const items = await reader.read({
        ...filters,
        ownerId: actor.role === 'resident' ? actor.id : null,
      });
      return { items };
    },
  };
}
