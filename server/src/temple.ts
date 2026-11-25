import type { makeAccess } from './access.ts';

type Profile = Awaited<ReturnType<ReturnType<typeof makeAccess>['profile']>>;
type Active = NonNullable<Profile['active']>;
const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const title = (value: string) => value.replace(/[._-]/g,' ').replace(/^./, first => first.toUpperCase());

export function templePage(active: Active, selected: string | null) {
  const groups = new Map<string, string[]>();
  for (const permission of active.permissions) {
    const area = permission.split('.')[0];
    const actions = groups.get(area) ?? [];
    actions.push(permission);
    groups.set(area, actions);
  }
  if (selected && !groups.has(selected)) return null;
  const fields = [['Institution',active.institution],['Jurisdiction',active.jurisdiction],['Station',active.station],
    ['Shift',active.shift],['Case',active.caseId],['Work order',active.workOrderId]];
  const scope = fields.filter(([,value]) => value).map(([label,value]) =>
    '<dt>' + label + '</dt><dd>' + escape(value!) + '</dd>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Temple workspace · MyPrayer</title><link rel="stylesheet" href="/staff/temple.css"></head><body>
  <header><a class="brand" href="/temple">pray<span></span></a><nav><a href="/temple">Temple overview</a><a href="/staff/sign-in?manage">My assignment</a></nav></header>
  <main><p class="institution">${escape(active.institution)}</p><h1>Temple workspace</h1>
  <h2>${escape(title(active.role))}</h2><dl>${scope}</dl><h2>Your access</h2>
  <section class="areas">${Array.from(groups, ([area,actions]) =>
    `<a href="/temple?area=${encodeURIComponent(area)}"><strong>${escape(title(area))}</strong><small>${actions.length} assigned ${actions.length === 1 ? 'permission' : 'permissions'}</small></a>`).join('')}</section></main>
  ${selected ? `<aside aria-labelledby="area-title"><a href="/temple" aria-label="Close details">Close</a><h2 id="area-title">${escape(title(selected))}</h2><ul>${groups.get(selected)!.map(p => '<li>' + escape(title(p)) + '</li>').join('')}</ul><h3>Assigned scope</h3><dl>${scope}</dl></aside>` : ''}</body></html>`;
}
