const modules=[{title:'Ticketing',desc:'Issue and manage darshana, seva and special entry tickets for devotees.',tools:['Manage availability','Issue e-tickets','Print tickets','Validate admission','Manage refunds','Reconcile sales']},{title:'Fund collection',desc:'Record donations, issue receipts and track all temple collections.',tools:['Record donation','Issue receipt','Collection register']},{title:'Accommodation',desc:'Manage temple rooms and guest stays, from booking to check-out.',tools:['Room availability','Guest booking','Guest check-in','Guest check-out','Housekeeping','Maintenance']},{title:'Sevas & rituals',desc:'Schedule, conduct and manage sevas, poojas and other temple rituals.',tools:['Seva schedule','Seva bookings','Ritual register']},{title:'Annadana & meals',desc:'Plan and run annadana, manage meal service and track daily meal counts.',tools:['Meal planning','Meal service','Daily meal counts']},{title:'Facilities',desc:'Manage temple facilities, maintenance requests and day-to-day upkeep.',tools:['Facility register','Maintenance requests','Work orders']}];


const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const asset=n=>'assets/'+n;
const iconPaths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  meal: '<path d="M3 13h18a9 9 0 0 1-18 0Zm5-3c-2-2 2-3 0-6m4 6c-2-2 2-3 0-6m4 6c-2-2 2-3 0-6"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M3 3l18 18M10.5 6.1a13 13 0 0 1 1.5-.1c6.5 0 10 6 10 6a14 14 0 0 1-3 3.4M6.2 7.8A17 17 0 0 0 2 12s3.5 6 10 6a11 11 0 0 0 3.6-.6"/>',
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}
function togglePassword(button) {
  const password = document.getElementById('password');
  const reveal = password.type === 'password';
  password.type = reveal ? 'text' : 'password';
  button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  button.innerHTML = icon(reveal ? 'eyeOff' : 'eye');
}

function visitorPage() {
  return `<section class="feature-hero"><img class="hero-art" src="${asset('temple-hero.jpg')}" alt="Monochrome temple gateway"><div class="hero-copy"><p class="eyebrow">Karnataka temple portal</p><h1>Plan your temple visit</h1><p>Find darshan timings, sevas and visitor facilities.</p><form class="search-row" onsubmit="event.preventDefault();searchTerm=document.getElementById('temple-search').value;go('search')"><label class="search-field">${icon('search')}<input id="temple-search" name="temple" aria-label="Temple or location" placeholder="Temple or location"></label><button class="primary">Search</button></form></div></section><section class="featured"><img src="${asset('temple-feature.jpg')}" alt="Temple exterior"><div><strong class="red">Featured</strong><h2>Kabbalamma Temple</h2><div class="featured-links"><button onclick="openDrawer('Darshan timings','service',0)">${icon('calendar')}<span>Darshan timings ›</span></button><button onclick="openDrawer('Sevas and meals','service',1)">${icon('meal')}<span>Sevas and meals ›</span></button><button onclick="openDrawer('Access and directions','service',2)">${icon('pin')}<span>Access and directions ›</span></button></div></div></section>`;
}

function loginPage() {
  return `<div class="login-grid"><img class="login-art" src="${asset('temple-login.jpg')}" alt="Black and white temple stone carvings"><section class="login-form"><h1>Staff login</h1><p class="sub">Sign in to your assigned temple workspace.</p><form onsubmit="event.preventDefault();go('home')"><label class="field-label" for="staff-id">Staff ID or email</label><input class="field" id="staff-id" autocomplete="username" placeholder="" required><label class="field-label" for="password">Password</label><div class="password-wrap"><input class="field" id="password" type="password" autocomplete="current-password" required><button class="eye" type="button" aria-label="Show password" onclick="togglePassword(this)">${icon('eye')}</button></div><button class="primary login-submit">Sign in</button></form><div class="login-footer"><button onclick="openDrawer('Forgot password?','generic','Contact the temple administrator to recover your staff account. Authentication is simulated during Wave 1.')">Forgot password?</button><button onclick="go('visit')">Return to temple portal</button></div></section></div>`;
}

const temple = 'Kabbalamma Temple';
const visitDate = '25 November 2026';
const nav = document.getElementById('nav');
const page = document.getElementById('page');
const drawer = document.getElementById('drawer-root');
const drawerStack = [];
const publicRoutes = ['visit', 'login', 'search', 'service'];
const visitorServices = ['Darshan timings', 'Sevas and meals', 'Access and directions', 'Visitor help'];
const ticketTools = [
  ['Manage availability', 'Set and update date-wise time slots and ticket limits.', '10:00 am · 11:00 am · 12:00 pm'],
  ['Issue tickets', 'Create and hand over tickets for darshan, sevas or other temple services.', 'Darshan · Archana seva · Special entry'],
  ['Print tickets', 'Print official tickets with QR code and visit details at the counter.'],
  ['Validate admission', 'Scan the ticket QR code at the entry gate to confirm and record admission.', 'Gate 01 · Ticket KT458762 · Issued'],
  ['Manage refunds', 'Process and record refunds for eligible tickets with a receipt.', 'Pending review · Ticket KT458763'],
  ['Reconcile sales', 'Match ticket receipts with the sales ledger to confirm collections.', 'Counter 01 · Sales receipts and ledger'],
];
const stayTools = [
  ['Room availability', 'See which rooms are free by date', '12 rooms available on ' + visitDate],
  ['Manage bookings', 'Create or update a guest stay', 'BK-01456 · Room 102'],
  ['Guest check-in', 'Assign a room and record arrival', 'BK-01456 · Arrival 10:30 am'],
  ['Guest check-out', 'Close the stay and release the room', '5 departures scheduled'],
  ['Housekeeping', 'Mark rooms clean and ready', '3 rooms to clean'],
  ['Room maintenance', 'Block rooms that need repairs', 'Room repair register'],
];
const arrivals = [
  ['BK-01456', 'Ramesh Gowda', '3', '102', '10:30 am', '2'],
  ['BK-01457', 'Meena Hegde', '2', '104', '11:15 am', '1'],
];
const attention = [
  ['Counter 02 unopened', 'Counter 02 is awaiting opening.', 'print'],
  ['Payment awaiting review', 'Review the sample counter collection in the ticketing module.', 'module/0'],
  ['Accessible washroom repair', 'View the Facilities module for maintenance requests.', 'module/5'],
];
const schedule = [
  ['09:30', 'Archana seva', 'module/3'],
  ['12:30', 'Annadana service', 'module/4'],
  ['17:30', 'Evening pooja', 'module/3'],
];
const sampleTickets = new Map([
  ['KT458762', { date: visitDate, time: '10:30 am', visitors: 2, status: 'Issued' }],
  ['KT458763', { date: visitDate, time: '11:00 am', visitors: 1, status: 'Issued' }],
  ['MPY78456321', { date: '24 January 2025', time: '10:30 am', visitors: 2, status: 'Confirmed' }],
]);
let route = readRoute();
let activeMenu = '';
let searchTerm = '';
let ticketQuery = 'KT458762';
let selectedTicket = ticketQuery;
let sampleVerified = false;
let copies = 1;
let drawerTrigger;

function readRoute() {
  const path = location.hash.slice(1) || 'visit';
  return /^(visit|login|home|modules|search|print|module\/[0-5]|admin\/[0-2]|service\/[0-3])$/.test(path) ? path : 'visit';
}

function go(path) {
  if (route !== path) {
    location.hash = path;
    return;
  }
  activeMenu = '';
  closeDrawer(false);
  render();
}

function stats(items) {
  return `<dl class="stat-row">${items.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function routeLink(label, path, active = false, className = '') {
  return `<a class="navlink ${active ? 'active' : ''} ${className}" href="#${path}" ${active ? 'aria-current="page"' : ''}>${label}</a>`;
}

function menu(id, label, entries, active = false) {
  const expanded = activeMenu === id;
  return `<div class="dropdown ${expanded ? 'open' : ''}">
    <button type="button" class="navlink ${active || expanded ? 'active' : ''}" aria-expanded="${expanded}" aria-controls="menu-${id}" data-menu="${id}">${label}<span class="chevron" aria-hidden="true"></span></button>
    <div class="menu" id="menu-${id}" ${expanded ? '' : 'hidden'}>
      ${entries.map(([name, path, action]) => action
        ? `<button type="button" data-action="${action}">${name}</button>`
        : `<a href="#${path}" ${route === path ? 'aria-current="page"' : ''}>${name}</a>`).join('')}
    </div>
  </div>`;
}

function renderNav() {
  const isPublic = publicRoutes.includes(route.split('/')[0]);
  const onOverview = route === 'home';
  const moduleLinks = modules.map(({title}, i) => [title, 'module/' + i]);
  const brand = `<a id="brand" href="#${isPublic ? 'visit' : 'home'}">${isPublic || onOverview ? 'pray' : 'myprayer'}${onOverview ? '<span class="karnataka-mark" aria-hidden="true"></span>' : ''}</a>`;
  if (isPublic) {
    nav.innerHTML = brand + '<span class="right"></span>'
      + menu('visit', 'Visit a temple', [['Kabbalamma Temple', 'visit'], ['Temple directory', 'search']], route === 'visit' || route === 'search')
      + menu('services', 'Services', visitorServices.slice(0, 3).map((name, i) => [name, 'service/' + i]), route.startsWith('service/'))
      + menu('help', 'Help', [['Visitor help', 'service/3']])
      + routeLink('Staff login', 'login', route === 'login', route === 'login' ? '' : 'staff-login-link');
    return;
  }
  nav.innerHTML = brand + '<span class="right"></span>'
    + routeLink('Overview', 'home', onOverview)
    + menu('modules', onOverview ? 'Temple services' : 'Modules', moduleLinks, route.startsWith('module/') || ['modules', 'print'].includes(route))
    + (onOverview ? menu('counter', 'Counter &amp; gate', [
      ['Printing counter', 'print'], ['Gate admission', '', 'gate-admission'], ['Operator verification', '', 'photo-check'],
    ]) : '')
    + menu('administration', 'Administration', [['Organisation', 'admin/0'], ['Users and roles', 'admin/1'], ['Photo verification', 'admin/2']], route.startsWith('admin/'))
    + menu('account', '<span class="avatar">EO</span><span class="sr-only">Account</span>', [['Sign out', 'visit']]);
}

function overviewPage() {
  return `<section class="overview-hero">
      <img src="${asset('overview-hero.jpg')}" alt="" class="overview-art">
      <div class="overview-copy"><p class="temple-name">${temple}</p><h1>Temple overview</h1>
        <p class="overview-date">Wednesday, 25 November</p>
        ${stats([['Booked visits', '248'], ['Counter receipts', '84'], ['Open exceptions', '3']])}
      </div>
    </section>
    <div class="overview-detail">
      <section><h2>Needs attention</h2><ul>${attention.map(([title], i) =>
        `<li><button type="button" data-action="attention" data-index="${i}">${title}${i === 0 ? '<span class="exception" aria-label="Requires attention">!</span>' : ''}</button></li>`).join('')}</ul></section>
      <section><h2>Today’s schedule</h2><ul>${schedule.map(([time, title], i) =>
        `<li><button type="button" data-action="schedule" data-index="${i}"><strong>${time}</strong><span>${title}</span></button></li>`).join('')}</ul></section>
    </div>`;
}

function illustratedCard(title, description, image, attrs) {
  return `<button class="illustrated-card" type="button" ${attrs}>
    <img src="${asset(image)}" alt=""><span class="illustrated-copy"><strong>${title}</strong><span>${description}</span></span>
  </button>`;
}

function moduleDirectory() {
  return `<div class="mock-workspace"><h1>Temple services</h1><p class="module-lead">${temple}</p>
    <div class="illustrated-grid">${modules.map((m, i) =>
      illustratedCard(m.title, m.desc, 'module-' + (i + 1) + '.jpg', `data-route="module/${i}"`)).join('')}</div></div>`;
}

function arrivalsTable() {
  const columns = ['Booking no.', 'Guest name', 'No. of guests', 'Room', 'Arrival time', 'Stay (nights)'];
  return `<h2 class="ruled-title">Today’s arrivals</h2><div class="arrival-scroll"><table class="arrival-table">
    <thead><tr>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody>${arrivals.map(([booking, ...values], i) => `<tr><td><button type="button" class="plain-link" data-action="arrival" data-index="${i}">${booking}</button></td>
      ${values.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function modulePage(index) {
  const model = modules[index];
  const isTicketing = index === 0;
  const isStay = index === 2;
  const tools = isTicketing ? ticketTools : isStay ? stayTools : model.tools.map(title => [title, 'View and manage ' + title.toLowerCase() + '.']);
  const description = isTicketing ? 'Manage ticket availability, issuance, validation, refunds and sales reconciliation.' : isStay ? temple : model.desc;
  const family = isTicketing ? 'ticketing-view' : isStay ? 'stay-view' : '';
  return `<div class="mock-workspace ${family}">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#modules">Modules</a><span aria-hidden="true">/</span><span>${model.title}</span></nav>
    <div class="module-title"><div><h1>${model.title}</h1><p class="module-lead">${description}</p></div>
      ${isStay ? '<button type="button" class="primary" data-action="new-booking">New booking</button>' : ''}</div>
    ${isStay ? stats([['Available rooms', '12'], ['Arrivals today', '8'], ['Departures today', '5'], ['Rooms to clean', '3']]) + '<h2 class="ruled-title">Accommodation tools</h2>' : ''}
    <section class="illustrated-grid" aria-label="${model.title} tools">${tools.map(([title, desc], i) => {
      const image = isTicketing ? `ticketing-${i + 1}.jpg` : isStay ? `stay-${i + 1}.jpg` : `module-${index + 1}.jpg`;
      return illustratedCard(title, desc, image, isTicketing && i === 2
        ? 'data-route="print"' : `data-action="module-tool" data-module="${index}" data-index="${i}"`);
    }).join('')}</section>
    ${isStay ? arrivalsTable() : ''}
  </div>`;
}

function ticketFacts(ticket) {
  return [
    ['Service', 'Darshan'], ['Date &amp; time', ticket.date + ' · ' + ticket.time],
    ['Visitors', ticket.visitors + ' visitors'], ['Status', '<span class="status-chip">' + ticket.status + '</span>'],
  ];
}

function printPage() {
  const ticket = sampleTickets.get(selectedTicket);
  return `<div class="mock-workspace print-view">
    <section class="print-hero"><img src="${asset('print-counter.jpg')}" alt=""><div><h1>Print e-ticket</h1><p>${temple} · Counter 01</p></div></section>
    <div class="print-layout">
      <div class="ticket-controls">
        <section class="border-panel"><h2>Find ticket</h2>
          <form id="ticket-search" class="ticket-search">
            <div class="ticket-input">${icon('search')}<input id="ticket-query" name="ticket" aria-label="Ticket number" value="${esc(ticketQuery)}" required>
              <button type="button" class="clear-ticket" data-action="clear-ticket" aria-label="Clear ticket number">×</button>
            </div><button type="submit" class="primary">Search</button>
          </form>
          ${ticket ? '' : '<p class="ticket-message" role="status">No sample ticket found. Try KT458762.</p>'}
        </section>
        <section class="border-panel"><h2>Selected ticket</h2>
          ${ticket ? `<dl class="ticket-facts">${ticketFacts(ticket).map(([label, value]) =>
            `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>` : '<p>Search for a ticket to see its details.</p>'}
        </section>
        <section class="border-panel"><h2>Operator photo check</h2>
          <div class="operator-row"><div class="camera-tile">${cameraIcon()}</div>
            <div><strong class="operator-status ${sampleVerified ? 'verified' : ''}">${sampleVerified ? 'Demo verification complete' : 'Verification required'}</strong>
              <p>${sampleVerified ? 'Sample verification applied to this ticket.' : 'Take a live photo to unlock printing.'}</p>
              <button type="button" class="primary icon-button" data-action="photo-check" ${ticket ? '' : 'disabled'}>${cameraIcon()} Verify with camera</button>
            </div>
          </div>
        </section>
      </div>
      <section class="border-panel print-panel"><h2>Print preview</h2>
        <div class="preview-stage">
          ${ticket ? `<article class="ticket-paper"><img class="ticket-emblem" src="${asset('ticket-temple-mark.jpg')}" alt=""><strong>${temple}</strong><hr><h3>Darshan</h3>
            <p>Ticket No: <b>${selectedTicket}</b><br>Date: ${ticket.date}<br>Time: ${ticket.time}</p>
            <img class="sample-qr" src="${asset('sample-qr.jpg')}" alt="Sample QR illustration"><strong>Visitors: ${ticket.visitors}</strong>
          </article>` : '<p>A ticket preview will appear here.</p>'}
        </div>
        <div class="printer-options"><span><strong>Printer:</strong> Counter 01 · Ready</span><label>Copies:
          <select id="ticket-copies" name="copies">${[1, 2, 3, 4, 5].map(i =>
            `<option value="${i}" ${i === copies ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        </div>
        <button type="button" class="primary print-action" data-action="print-demo" ${ticket && sampleVerified ? '' : 'disabled'}>Print e-ticket</button>
      </section>
    </div>
  </div>`;
}

function cameraIcon() {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M8 5h8l1.5 3H21a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.5Z"/><circle cx="12" cy="14" r="4"/></svg>';
}

function searchPage() {
  return `<div class="mock-workspace"><h1>Temple directory</h1>
    <p class="module-lead">${searchTerm ? 'Search for ' + esc(searchTerm) : 'Explore temples'}</p>
    <div class="directory-result">${illustratedCard(temple, 'Darshan timings · Sevas · Visitor information',
      'temple-feature.jpg', 'data-action="visitor-result"')}</div></div>`;
}

function servicePage(index) {
  return `<div class="mock-workspace"><h1>${visitorServices[index]}</h1><p class="module-lead">${temple}</p>
    <button type="button" class="primary" data-action="visitor-service" data-index="${index}">View details</button></div>`;
}

function adminPage(index) {
  const title = ['Organisation', 'Users and roles', 'Photo verification'][index];
  return `<div class="mock-workspace"><h1>${title}</h1><p class="module-lead">${temple}</p>
    <button type="button" class="primary" data-action="${index === 2 ? 'photo-check' : 'admin-detail'}">View details</button></div>`;
}

function render() {
  const [name, arg] = route.split('/');
  const index = Number(arg);
  const titles = {visit: 'Temple visit', login: 'Staff login', home: 'Temple overview', modules: 'Temple services', module: modules[index]?.title,
    print: 'Print e-ticket', search: 'Temple directory', service: visitorServices[index], admin: 'Administration'};
  document.body.className = publicRoutes.includes(name) ? name : 'staff view-' + name;
  renderNav();
  const pages = {visit: visitorPage, login: loginPage, home: overviewPage, modules: moduleDirectory,
    module: () => modulePage(index), print: printPage, search: searchPage, service: () => servicePage(index), admin: () => adminPage(index)};
  page.innerHTML = pages[name]();
  document.title = titles[name] + ' · myPrayer';
}

function openDrawer(title, type, data) {
  if (!drawerStack.length) drawerTrigger = document.activeElement;
  drawerStack.push({title, type, data});
  renderDrawer();
}

function closeDrawer(restoreFocus = true) {
  drawerStack.length = 0;
  renderDrawer();
  if (restoreFocus) drawerTrigger?.focus();
  drawerTrigger = null;
}

function bodyForDrawer({title, type, data}) {
  if (type === 'photo') {
    return `<div class="photo-content"><img class="photo-sample" src="${asset('sample-operator.jpg')}" alt="Sample operator portrait">
      <h3>Look straight at the camera</h3>
      <button type="button" class="primary icon-button" data-action="capture-demo">${cameraIcon()} Capture photo</button>
      <button type="button" class="plain-link" data-action="close-drawer">Cancel</button>
      <small>Demo photo check</small></div>`;
  }
  if (type === 'new-booking') {
    return `<form id="sample-booking" class="booking-form"><label>Guest name<input name="guest" required></label>
      <label>Stay (nights)<input type="number" name="nights" value="1" min="1" required></label>
      <button type="submit" class="primary">Preview booking</button></form>`;
  }
  if (type === 'service') {
    const messages = ['Confirm current darshan timings with the temple office.', 'Explore sevas and meal services at the temple.',
      'Ask the temple office for current visitor access and directions.', 'The temple office can assist with your visit.'];
    return `<img src="${asset('temple-feature.jpg')}" alt="Temple exterior"><p>${messages[data]}</p>`;
  }
  if (type === 'detail') {
    return `<p>${esc(data.summary)}</p>${data.path ? `<button type="button" class="primary" data-route="${data.path}">Open module</button>` :
      `<button type="button" class="primary" data-action="detail-record">View details</button>`}`;
  }
  return `<p>${esc(data)}</p>`;
}

function renderDrawer() {
  const current = drawerStack.at(-1);
  if (!current) {
    drawer.replaceChildren();
    return;
  }
  const photo = current.type === 'photo';
  drawer.innerHTML = `<dialog class="drawer ${photo ? 'photo-drawer' : 'detail-drawer'}" aria-labelledby="drawer-title">
    <div class="drawer-head">
      ${drawerStack.length > 1 ? '<button type="button" data-action="back-drawer">← Back</button>' : ''}
      <button type="button" class="close" data-action="close-drawer" aria-label="Close drawer">×</button>
    </div>
    <header class="drawer-heading"><h2 id="drawer-title">${esc(current.title)}</h2>
    ${photo ? `<p>Counter 01 · ${temple}</p>` : ''}</header>
    <div class="drawer-body">${bodyForDrawer(current)}</div>
  </dialog>`;
  const dialog = drawer.firstElementChild;
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDrawer(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDrawer();
  });
  dialog.showModal();
}

const actions = {
  'close-drawer': closeDrawer,
  'back-drawer': () => { drawerStack.pop(); renderDrawer(); },
  'photo-check': () => openDrawer('Operator photo check', 'photo'),
  'capture-demo': () => {
    closeDrawer();
    if (route === 'print') { sampleVerified = true; render(); document.querySelector('[data-action="print-demo"]').focus(); }
    else openDrawer('Demo verification complete', 'generic', 'The sample photo check is complete.');
  },
  'clear-ticket': () => {
    ticketQuery = '';
    selectedTicket = '';
    sampleVerified = false;
    render();
    document.getElementById('ticket-query').focus();
  },
  'print-demo': () => openDrawer('Print e-ticket', 'generic', `Demo print scheduled for ${selectedTicket}. Copies: ${copies}.`),
  'gate-admission': () => openDrawer('Gate admission', 'detail', {summary: ticketTools[3][2], path: 'module/0'}),
  'visitor-result': () => openDrawer(temple, 'service', 0),
  'visitor-service': i => openDrawer(visitorServices[i], 'service', i),
  'new-booking': () => openDrawer('New booking', 'new-booking'),
  'arrival': i => {
    const [id, guest, guests, room, time, nights] = arrivals[i];
    openDrawer(id, 'generic', `${guest} · ${guests} guests · Room ${room} · ${time} · ${nights} night(s)`);
  },
  'attention': i => {
    const [title, summary, path] = attention[i];
    openDrawer(title, 'detail', {summary, path});
  },
  'schedule': i => {
    const [time, title, path] = schedule[i];
    openDrawer(title, 'detail', {summary: time + ' · ' + temple, path});
  },
  'module-tool': (i, moduleIndex) => {
    const model = moduleIndex === 0 ? ticketTools[i] : moduleIndex === 2 ? stayTools[i] : [modules[moduleIndex].tools[i]];
    openDrawer(model[0], 'detail', {summary: model[2] || model[0] + ' · ' + temple});
  },
  'detail-record': () => {
    const current = drawerStack.at(-1);
    openDrawer(current.title + ' details', 'generic', current.data.summary);
  },
  'admin-detail': () => openDrawer('Administration details', 'generic', 'MyPrayer staff administration preview for ' + temple + '.'),
};

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.menu) {
    activeMenu = activeMenu === button.dataset.menu ? '' : button.dataset.menu;
    renderNav();
    nav.querySelector('[data-menu="' + button.dataset.menu + '"]')?.focus();
    return;
  }
  const headerLink = event.target.closest('#nav a');
  if (headerLink && headerLink.hash === location.hash) {
    activeMenu = '';
    renderNav();
    return;
  }
  if (activeMenu && !headerLink && !event.target.closest('.dropdown')) {
    activeMenu = '';
    renderNav();
  }
  if (button?.dataset.route) go(button.dataset.route);
  const action = actions[button?.dataset.action];
  if (action) {
    if (button.dataset.action === 'close-drawer') action();
    else action(Number(button.dataset.index), Number(button.dataset.module));
  }
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (form.id === 'ticket-search') {
    event.preventDefault();
    ticketQuery = String(new FormData(form).get('ticket')).trim().toUpperCase();
    selectedTicket = sampleTickets.has(ticketQuery) ? ticketQuery : '';
    sampleVerified = false;
    render();
    document.getElementById('ticket-query').focus();
  } else if (form.id === 'sample-booking') {
    event.preventDefault();
    const details = new FormData(form);
    openDrawer('Booking preview', 'generic', `${details.get('guest')} · ${details.get('nights')} night(s) · Demo booking`);
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'ticket-copies') copies = Number(event.target.value);
});

window.addEventListener('hashchange', () => {
  route = readRoute();
  if (route !== 'print') sampleVerified = false;
  activeMenu = '';
  closeDrawer(false);
  render();
  scrollTo(0, 0);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeMenu) {
    const menuId = activeMenu;
    activeMenu = '';
    renderNav();
    nav.querySelector('[data-menu="' + menuId + '"]')?.focus();
  }
});

render();
