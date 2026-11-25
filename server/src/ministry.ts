import { readFile } from 'node:fs/promises';

const modules = [
  { id: 'registry', title: 'Temple registry', description: 'Review institutions and registry changes.', permission: /^(registry\.|oversight\.jurisdiction\.read$)/ },
  { id: 'inspections', title: 'Inspections', description: 'Review assigned inspections and follow-up.', permission: /^(inspection\.|government\.case\.review$)/ },
  { id: 'finance', title: 'Finance oversight', description: 'Review authorized finance evidence.', permission: /^finance\./ },
  { id: 'governance', title: 'Governance cases', description: 'Review assigned cases and decisions.', permission: /^(government\.case\.|governance\.case\.)/ },
  { id: 'performance', title: 'Service performance', description: 'See service indicators for your scope.', permission: /^oversight\./ },
  { id: 'audit', title: 'Reports & audit', description: 'Review authorized audit evidence.', permission: /^audit\./ },
];
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export async function ministryImage(id: string) {
  if (id !== 'hero' && !modules.some(module => module.id === id)) return null;
  return Buffer.from(await readFile(new URL('../assets/ministry/' + id + '.jpg.b64', import.meta.url), 'utf8'), 'base64');
}

type MinistryAssignment = { role: string; institution: string; jurisdiction?: string; permissions: string[] };

export function ministryPage(assignment: MinistryAssignment, selectedId: string | null, districts: boolean) {
  const allowed = modules.filter(module => assignment.permissions.some(permission => module.permission.test(permission)));
  const selected = allowed.find(module => module.id === selectedId);
  if (selectedId && !selected) return null;
  const jurisdiction = escape(assignment.jurisdiction ?? assignment.institution);
  const title = districts ? 'District oversight' : 'Ministry oversight';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Pray</title>
  <style>
  :root{color:#151515;background:#fdfdfd;font:16px Georgia,serif}*{box-sizing:border-box}
  body{margin:0}a{color:inherit}header{height:56px;border-bottom:1px solid #bbb;display:flex;align-items:center;gap:24px;padding:0 clamp(18px,3vw,44px)}header a{text-decoration:none}header .active{border-bottom:3px solid #f4c700;padding-block:15px}
  .brand{font-size:30px;font-weight:bold;margin-right:12px}.mark{display:inline-block;width:23px;height:13px;background:linear-gradient(#ffd900 50%,#db1624 50%);margin-left:6px}
  main{max-width:1440px;margin:auto;padding:0 clamp(18px,3vw,44px) 32px}.hero{position:relative;isolation:isolate;display:grid;align-content:center;min-height:235px;border-bottom:1px solid #bcbcbc}
  .hero img{position:absolute;right:0;top:0;width:64%;height:100%;object-fit:cover;z-index:-1;mask-image:linear-gradient(90deg,transparent,#000 42%)}h1,h2,h3,p{margin:0}
  h1{font-size:clamp(32px,4vw,58px);margin:5px 0}h2{font-size:25px;margin-bottom:10px}.note{color:#565656}.scope{margin-top:15px}
  .queues{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:18px 0}.queues p{padding:8px 0;border-bottom:1px solid #ddd}
  .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.card{display:block;border:1px solid #ccc;border-radius:10px;padding:7px;text-decoration:none;background:white}
  .card img{width:100%;height:clamp(88px,12vw,154px);object-fit:cover;border-radius:5px}.card h3{font-size:20px;margin:4px 3px}.card p{margin:0 3px 4px;color:#555}
  a:focus-visible{outline:3px solid #886600;outline-offset:3px}.district{margin-top:18px}aside{position:fixed;inset:56px 0 0 auto;background:#fff;border-left:1px solid #bbb;box-shadow:-6px 0 20px #0002;padding:24px;width:min(460px,100vw);overflow:auto}aside img{width:100%;border-radius:6px;margin:10px 0}
  .drawer-head{display:flex;justify-content:space-between;gap:12px}.drawer-head a{font-size:24px;text-decoration:none}
  @media(max-width:640px){header{gap:14px}.brand{font-size:24px}.queues{grid-template-columns:1fr;gap:14px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.hero img{opacity:.38}.hero{min-height:190px}}
  </style></head><body>
  <header><a class="brand" href="/ministry">pray<span class="mark" aria-hidden="true"></span></a>
  <a class="${districts ? '' : 'active'}" href="/ministry">Overview</a><a class="${districts ? 'active' : ''}" href="/ministry?view=districts">Districts</a>
  <a href="/ministry#modules">Modules</a></header>
  <main><section class="hero"><img src="/ministry/art/hero" alt=""><p>Karnataka · HRI&amp;CE</p><h1>${title}</h1>
  <p class="note">Staging preview</p><p class="scope"><strong>Assigned scope:</strong> ${jurisdiction}</p></section>
  ${districts ? '<section class="district"><h2>Temples in scope</h2><p class="note">Registry data will appear here when connected.</p></section>' :
    '<div class="queues"><section><h2>Needs attention</h2><p class="note">No review feed is connected.</p></section><section><h2>Upcoming reviews</h2><p class="note">No review schedule is connected.</p></section></div>'}
  <section id="modules"><h2>Oversight modules</h2>
  <div class="cards">${allowed.map(module => `<a class="card" href="/ministry?${districts ? 'view=districts&amp;' : ''}module=${module.id}"><img src="/ministry/art/${module.id}" alt=""><h3>${escape(module.title)}</h3><p>${escape(module.description)}</p></a>`).join('')}</div></section></main>
  ${selected ? `<aside aria-labelledby="detail-title"><div class="drawer-head"><h2 id="detail-title">${escape(selected.title)}</h2><a aria-label="Close drawer" href="${districts ? '/ministry?view=districts' : '/ministry'}">×</a></div><p>${jurisdiction}</p><img src="/ministry/art/${selected.id}" alt=""><p class="note">Records will appear here when connected.</p></aside>` : ''}
  </body></html>`;
}
