const status = document.querySelector('#status');
const firstFactor = document.querySelector('#first-factor');
const photo = document.querySelector('#photo-step');
const assignment = document.querySelector('#assignment-step');
const restart = document.querySelector('#restart');
const otpForm = document.querySelector('#otp-verify');
const demoCode = document.querySelector('#demo-code');
let challengeId = '';
let busy = false;
let stream;
let center;
let direction;
const preview = document.querySelector('#preview');
const frame = document.querySelector('#frame');
const instruction = document.querySelector('#instruction');

function stopCamera() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  center = undefined;
  preview.srcObject = null;
}
window.addEventListener('pagehide', stopCamera);

async function request(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('request failed');
  return response.json();
}

function stage(section, message) {
  for (const candidate of [firstFactor, photo, assignment]) candidate.hidden = candidate !== section;
  restart.hidden = section === firstFactor;
  status.textContent = message;
}

function action(target, event, run, errorMessage) {
  target.addEventListener(event, async e => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const controls = target.matches('form') ? [...target.querySelectorAll('button')] : [target];
    for (const button of controls) button.disabled = true;
    try { await run(); } catch { status.textContent = errorMessage; }
    finally {
      busy = false;
      for (const button of controls) button.disabled = false;
    }
  });
}

function showPhoto({captureUrl}) {
  const url = new URL(captureUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid camera link');
  direction = url.origin === location.origin && url.pathname === '/staff/sign-in' &&
    /^#camera-(left|right)$/.test(url.hash) ? url.hash.slice(8) : '';
  document.querySelector('#local-camera').hidden = !direction;
  document.querySelector('#external-camera').hidden = !!direction;
  stopCamera();
  frame.hidden = false;
  frame.textContent = 'Start camera';
  instruction.textContent = 'Allow camera access, then look directly at the camera.';
  document.querySelector('#capture').href = url.href;
  stage(photo, 'First step verified. Complete the photo check to continue.');
}

function openWorkspace(profile, choose = false) {
  if (profile.active && !choose) {
    if (profile.active.workspace === 'ministry') location.assign('/ministry');
    else if (profile.active.workspace === 'temple') location.assign('/temple');
    else throw new Error('Unknown workspace');
    return;
  }
  const select = document.querySelector('#assignment-form select');
  select.replaceChildren();
  for (const item of profile.assignments) {
    const label = [item.role, item.workspace, item.institution, item.station].filter(Boolean).join(' · ');
    select.add(new Option(label, item.id));
  }
  stage(assignment, 'Select the assignment you want to use.');
}

const password = document.querySelector('#password-form');
action(password, 'submit', async () => {
  const data = Object.fromEntries(new FormData(password));
  password.reset();
  showPhoto(await request('/v1/password', data));
}, 'Sign-in failed. Check your details and try again.');

const otpRequest = document.querySelector('#otp-request');
action(otpRequest, 'submit', async () => {
  const result = await request('/v1/otp/request', Object.fromEntries(new FormData(otpRequest)));
  challengeId = result.id;
  otpForm.reset();
  demoCode.textContent = result.demoCode ? 'Demo code: ' + result.demoCode : 'No demo account found for that number.';
  otpForm.hidden = !result.demoCode;
}, 'The demo code could not be requested.');

action(otpForm, 'submit', async () => {
  const data = {id: challengeId, code: new FormData(otpForm).get('code')};
  const result = await request('/v1/otp/verify', data);
  otpForm.reset();
  demoCode.textContent = '';
  otpForm.hidden = true;
  challengeId = '';
  showPhoto(result);
}, 'The code was rejected. Try again or request a new code.');

action(document.querySelector('#finish-photo'), 'click', async () => {
  await request('/v1/photo/complete', {});
  openWorkspace(await request('/v1/session'));
}, 'Photo verification could not be completed. Start over to try again.');

const assignmentForm = document.querySelector('#assignment-form');
action(frame, 'click', async () => {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: 640, height: 480}, audio: false});
    preview.srcObject = stream;
    try { await preview.play(); } catch (error) { stopCamera(); throw error; }
    frame.textContent = 'Capture front view';
    return;
  }
  if (!preview.videoWidth) throw new Error('Camera unavailable');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(preview.videoWidth, preview.videoHeight));
  canvas.width = Math.round(preview.videoWidth * scale);
  canvas.height = Math.round(preview.videoHeight * scale);
  canvas.getContext('2d').drawImage(preview, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
  if (!center) {
    center = image;
    instruction.textContent = 'Turn your head slightly to your ' + direction + ' and hold still.';
    frame.textContent = 'Verify my photo';
    return;
  }
  const frames = [center, image];
  stopCamera();
  frame.hidden = true;
  instruction.textContent = 'Checking your photos…';
  try {
    await request('/v1/photo/complete', {frames});
    openWorkspace(await request('/v1/session'));
  } finally { instruction.textContent = ''; }
}, 'Camera verification did not finish. Check camera access and start over.');

action(assignmentForm, 'submit', async () => {
  openWorkspace(await request('/v1/assignment', Object.fromEntries(new FormData(assignmentForm))));
}, 'This assignment could not be opened.');

action(restart, 'click', async () => {
  stopCamera();
  await request('/v1/sign-out', {});
  document.querySelector('#logout').hidden = true;
  stage(firstFactor, 'Sign in to verify your identity and open your workspace.');
}, 'Could not reset sign-in. Try again.');

request('/v1/staff-config').then(config => {
  document.querySelector('#demo-options').hidden = !config.demoOtp;
}).catch(() => {});
request('/v1/session').then(profile => {
  document.querySelector('#logout').hidden = false;
  openWorkspace(profile, location.search === '?manage');
}).catch(() => {});

action(document.querySelector('#logout'), 'click', async () => { await request('/v1/sign-out', {}); location.replace('/staff/sign-in'); }, 'Sign-out failed. Try again.');
