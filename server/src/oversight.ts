import type { Db } from 'mongodb';

export type TempleSummary = {
  id: string;
  name: string;
  institution: string;
  jurisdiction: string;
  stateScope: string;
  inspection: 'Due' | 'Current';
  exceptions: number;
};
type WorkspaceScope = { institution: string; jurisdiction?: string; permissions: string[] };
export interface OversightStore {
  list(assignment: WorkspaceScope): Promise<TempleSummary[]>;
}
export function oversightFilter(assignment: WorkspaceScope) {
  if (assignment.permissions.includes('oversight.jurisdiction.read') && assignment.jurisdiction) {
    return { jurisdiction: assignment.jurisdiction };
  }
  if (assignment.permissions.includes('oversight.state.read')) {
    return { stateScope: assignment.institution, ...(assignment.jurisdiction ? { jurisdiction: assignment.jurisdiction } : {}) };
  }
  return null;
}
export async function mongoOversight(db: Db): Promise<OversightStore> {
  const temples = db.collection<TempleSummary>('ministry_temple_summary');
  await Promise.all([
    temples.createIndex({ stateScope: 1, id: 1 }, { unique: true }),
    temples.createIndex({ jurisdiction: 1, name: 1 }),
    temples.createIndex({ stateScope: 1, name: 1 }),
  ]);
  return {
    async list(assignment) {
      const filter = oversightFilter(assignment);
      if (!filter) return [];
      return temples.find(filter, {
        projection: { _id: 0, id: 1, name: 1, jurisdiction: 1, institution: 1, stateScope: 1, inspection: 1, exceptions: 1 },
      }).sort({ name: 1, id: 1 }).limit(100).toArray();
    },
  };
}
