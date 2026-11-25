export const policyVersion = 'roles-blueprint-v2';

export type Scope = {
  institution: string;
  jurisdiction?: string;
  station?: string;
  shift?: string;
  caseId?: string;
  workOrderId?: string;
};
export type Authority = {
  reference: string;
  permission: string;
  validFrom: Date;
  validUntil: Date;
  maximumAmountMinor?: number;
};
export type Assignment = Scope & {
  id: string;
  role: string;
  permissions: string[];
  validFrom: Date;
  validUntil?: Date;
  revoked?: boolean;
  authority?: Authority[];
};

// Pass resource data loaded by the business handler, including the underlying person ID.
export type Resource = Scope & {
  initiatorPersonId?: string;
  amountMinor?: number;
};

const roles: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'ministry-finance-reviewer': ['finance.oversight.read'],
  'ministry-auditor': ['audit.read', 'audit.export'],
  'state-oversight-reader': ['oversight.state.read'],
  'department-secretariat': ['oversight.state.read', 'government.case.draft', 'government.case.route'],
  'hrice-commissioner': ['oversight.state.read', 'government.case.review', 'government.case.decide'],
  'state-parishat-member': ['governance.case.read', 'governance.case.vote'],
  'deputy-commissioner': ['oversight.jurisdiction.read', 'government.case.review', 'government.case.decide'],
  'assistant-commissioner': ['oversight.jurisdiction.read', 'government.case.review', 'government.case.decide'],
  'district-parishat-member': ['governance.case.read', 'governance.case.vote'],
  'jurisdiction-reviewer': ['oversight.jurisdiction.read', 'government.case.review'],
  'sanctioner': ['government.case.review', 'government.case.decide'],
  'registry-operator': ['registry.propose'],
  'registry-approver': ['registry.approve'],
  'inspector': ['inspection.read', 'inspection.record', 'inspection.recommend'],
  'committee-member': ['governance.case.read', 'governance.case.vote'],
  'committee-chair': ['governance.case.read', 'governance.case.vote', 'governance.case.sign'],
  'appointed-administrator': ['temple.operations.read', 'governance.case.read', 'governance.case.sign'],
  'executive-officer': ['temple.operations.read', 'staff.assignment.propose', 'tariff.propose', 'temple.publish'],
  'trustee': ['governance.case.read', 'governance.case.vote', 'governance.case.sign'],
  'auditor': ['audit.read', 'audit.export', 'audit.finding.record', 'audit.finding.close'],
  'project-core': [],
  'access-administrator': ['staff.roster.read', 'staff.invite', 'staff.assignment.propose', 'staff.offboard'],
  'grant-approver': ['staff.roster.read', 'staff.assignment.approve'],
  'photo-enrollment-operator': ['photo.enroll'],
  'module-supervisor': ['module.tasks.read', 'module.tasks.assign'],
  'ritual-lead': ['ritual.schedule.propose', 'ritual.work.read', 'ritual.fulfil'],
  'ritual-worker': ['ritual.work.read', 'ritual.fulfil'],
  'ticketing-supervisor': ['ticket.lookup', 'ticket.availability.propose', 'ticket.reprint.approve', 'refund.request'],
  'cashier': ['ticket.lookup', 'ticket.issue', 'refund.request'],
  'print-operator': ['ticket.lookup', 'ticket.print', 'ticket.reprint.request'],
  'gate-verifier': ['admission.lookup', 'admission.redeem', 'admission.exception.record'],
  'crowd-worker': ['queue.task.read', 'incident.report'],
  'accountant': ['finance.reconcile', 'refund.request', 'adjustment.request'],
  'finance-approver': ['refund.approve', 'adjustment.approve'],
  'donation-counter-worker': ['donation.receipt.issue'],
  'hundi-counter': ['hundi.count.record'],
  'accommodation-worker': ['room.booking.read', 'room.booking.write', 'room.checkin', 'room.checkout'],
  'accommodation-supervisor': ['room.booking.read', 'room.block.approve', 'room.charge.dispute'],
  'housekeeper': ['room.task.read', 'room.task.complete'],
  'kitchen-lead': ['meal.shift.read', 'meal.stock.record', 'meal.fulfil', 'meal.hygiene.record'],
  'meal-worker': ['meal.shift.read', 'meal.fulfil'],
  'maintenance-supervisor': ['work.order.assign', 'work.order.read'],
  'maintenance-worker': ['work.order.read', 'work.order.complete'],
  'works-contractor': ['work.order.read', 'work.order.submit'],
  'works-certifier': ['work.order.read', 'work.order.certify'],
  'asset-custodian': ['asset.read', 'asset.custody.record', 'estate.lease.record'],
  'asset-valuer': ['asset.valuation.record'],
  'procurement-officer': ['tender.draft', 'tender.route'],
  'evaluation-panel-member': ['tender.evaluate'],
  'procurement-sanctioner': ['tender.award'],
  'helpdesk-operator': ['support.request.read', 'support.request.route'],
  'grievance-officer': ['support.request.read', 'support.request.resolve'],
  'volunteer': ['queue.task.read', 'visitor.directions'],
  'device-support': ['device.register', 'device.diagnostics.read'],
});

const ministryRoles = new Set([
  'ministry-finance-reviewer', 'ministry-auditor', 'state-oversight-reader', 'department-secretariat', 'hrice-commissioner', 'state-parishat-member',
  'deputy-commissioner', 'assistant-commissioner', 'district-parishat-member', 'jurisdiction-reviewer',
  'sanctioner', 'registry-operator', 'registry-approver', 'inspector',
]);

export function assignmentWorkspace(role: string): 'ministry' | 'temple' {
  return ministryRoles.has(role) ? 'ministry' : 'temple';
}

const caseActions = new Set([
  'government.case.draft', 'government.case.route', 'government.case.review', 'government.case.decide',
  'governance.case.read', 'governance.case.vote', 'governance.case.sign', 'audit.read', 'audit.export',
  'audit.finding.record', 'audit.finding.close', 'finance.oversight.read', 'tender.evaluate', 'tender.award', 'support.request.resolve',
]);
const authorityActions = new Set([
  'government.case.decide', 'governance.case.sign', 'registry.approve', 'staff.assignment.approve',
  'ticket.reprint.approve', 'refund.approve', 'adjustment.approve', 'room.block.approve',
  'work.order.certify', 'tender.award', 'audit.finding.close',
]);
const stationActions = new Set([
  'ticket.print', 'ticket.issue', 'ticket.reprint.request', 'admission.lookup', 'admission.redeem', 'donation.receipt.issue',
]);
const assignedWorkRoles = new Set(['maintenance-worker', 'works-contractor']);

function template(role: string): readonly string[] {
  return Object.hasOwn(roles, role) ? roles[role] : [];
}

export function grantedPermissions(assignment: Assignment): string[] {
  return template(assignment.role).filter(permission => assignment.permissions.includes(permission));
}

export function roleDecision(assignment: Assignment, permission: string, resource: Resource, personId: string, now: Date) {
  if (!template(assignment.role).includes(permission) || !assignment.permissions.includes(permission)) return null;

  // Jurisdiction-wide grants cover only the explicitly assigned jurisdiction. Case decisions and
  // operating permissions remain institution-scoped even for an officer with multiple assignments.
  if (permission === 'oversight.jurisdiction.read') {
    if (!assignment.jurisdiction || assignment.jurisdiction !== resource.jurisdiction) return null;
  } else if (assignment.institution !== resource.institution) {
    return null;
  }
  if (assignment.jurisdiction !== undefined && assignment.jurisdiction !== resource.jurisdiction) return null;
  if (assignment.station !== undefined && assignment.station !== resource.station) return null;
  if (stationActions.has(permission) && !assignment.station) return null;
  if (assignment.shift !== undefined && assignment.shift !== resource.shift) return null;
  if (assignment.caseId !== undefined && assignment.caseId !== resource.caseId) return null;
  if (caseActions.has(permission) && !assignment.caseId) return null;
  if (assignment.workOrderId !== undefined && assignment.workOrderId !== resource.workOrderId) return null;
  if (assignedWorkRoles.has(assignment.role) && !assignment.workOrderId) return null;

  if (!authorityActions.has(permission)) return {};
  if (!resource.initiatorPersonId || resource.initiatorPersonId === personId) return null;
  const authority = assignment.authority?.find(grant =>
    grant.permission === permission && grant.reference && grant.validFrom <= now && grant.validUntil > now &&
    (grant.maximumAmountMinor === undefined ||
      (typeof resource.amountMinor === 'number' && Number.isSafeInteger(resource.amountMinor) &&
        resource.amountMinor >= 0 && resource.amountMinor <= grant.maximumAmountMinor)),
  );
  return authority ? { authorityReference: authority.reference } : null;
}
