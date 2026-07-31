// Generates printable ID cards for employees entirely in the browser.
// For each employee we build the approved card layout as a hidden DOM node,
// snapshot it with html2canvas, and place each snapshot on its own CR80-sized
// page in a single PDF. The QR code is generated client-side and points to the
// employee's public credential page.
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import logoUrl from '@/assets/logo.jpg';

const NAVY = '#1A2238';
const RED = '#C0392B';
const GOLD = '#E8B33D';
const GREEN = '#2E7D5B';

// CR80 credit-card dimensions in inches.
const CARD_W_IN = 3.375;
const CARD_H_IN = 2.125;

// Render at high pixel density for crisp print output (~300+ DPI).
const PX_PER_IN = 320;
const CARD_W_PX = Math.round(CARD_W_IN * PX_PER_IN);
const CARD_H_PX = Math.round(CARD_H_IN * PX_PER_IN);

function publicCardUrl(slug) {
  const base = window.location.origin || 'https://3phaseapps.com';
  return `${base}/SafetyCredentials/${slug}`;
}

// Convert an image URL to a data URL so html2canvas reliably captures it
// (avoids cross-origin canvas taint on employee photos served from the API).
async function toDataUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null; // fall back to a placeholder if the photo can't be fetched
  }
}

// Build the card DOM node for one employee (matches the approved design:
// photo centered on the left, larger logo, name/position, QR bottom-right).
async function buildCardNode(emp, logoData) {
  const qrDataUrl = await QRCode.toDataURL(publicCardUrl(emp.slug), {
    margin: 0,
    width: 300,
    color: { dark: NAVY, light: '#ffffff' },
  });
  const photoData = emp.photo_url ? await toDataUrl(emp.photo_url) : null;

  const card = document.createElement('div');
  card.style.cssText = `
    width:${CARD_W_PX}px; height:${CARD_H_PX}px; position:relative;
    background:${NAVY}; color:#fff; overflow:hidden;
    font-family:'Helvetica Neue',Arial,sans-serif; box-sizing:border-box;
    display:flex;
  `;

  // Brand color rail
  const rail = document.createElement('div');
  rail.style.cssText = `width:${Math.round(0.06 * PX_PER_IN)}px; height:100%;
    background:linear-gradient(180deg, ${RED} 0 33%, ${GOLD} 33% 66%, ${GREEN} 66% 100%);`;
  card.appendChild(rail);

  // Left: photo centered vertically
  const photoCol = document.createElement('div');
  photoCol.style.cssText = `width:${Math.round(1.15 * PX_PER_IN)}px; height:100%;
    display:flex; align-items:center; justify-content:center; flex:none;`;
  const photoBox = document.createElement('div');
  const pSize = Math.round(0.92 * PX_PER_IN);
  photoBox.style.cssText = `width:${pSize}px; height:${pSize}px; border-radius:${Math.round(0.06 * PX_PER_IN)}px;
    overflow:hidden; border:${Math.round(0.02 * PX_PER_IN)}px solid #fff; background:#0e1426;
    display:flex; align-items:center; justify-content:center;`;
  if (photoData) {
    const img = document.createElement('img');
    img.src = photoData;
    img.style.cssText = 'width:100%; height:100%; object-fit:cover; object-position:center top;';
    photoBox.appendChild(img);
  } else {
    photoBox.style.color = '#3a4658';
    photoBox.style.fontSize = `${Math.round(0.5 * PX_PER_IN)}px`;
    photoBox.textContent = '👤';
  }
  photoCol.appendChild(photoBox);
  card.appendChild(photoCol);

  // Right: logo, name, position, QR
  const body = document.createElement('div');
  body.style.cssText = `flex:1; padding:${Math.round(0.16 * PX_PER_IN)}px ${Math.round(0.14 * PX_PER_IN)}px
    ${Math.round(0.14 * PX_PER_IN)}px 0; display:flex; flex-direction:column; min-width:0;`;

  const logoImg = document.createElement('img');
  logoImg.src = logoData;
  logoImg.style.cssText = `width:${Math.round(1.55 * PX_PER_IN)}px; max-width:100%;
    background:#fff; border-radius:${Math.round(0.05 * PX_PER_IN)}px;
    padding:${Math.round(0.05 * PX_PER_IN)}px ${Math.round(0.08 * PX_PER_IN)}px; align-self:flex-start;`;
  body.appendChild(logoImg);

  const tag = document.createElement('div');
  tag.style.cssText = 'margin-top:auto;';
  const nameForCard = formatName(emp.name);
  tag.innerHTML = `
    <div style="font-size:${Math.round(0.07 * PX_PER_IN)}px; letter-spacing:2px; text-transform:uppercase; color:${GOLD}; font-weight:700; margin-bottom:${Math.round(0.02 * PX_PER_IN)}px;">Employee ID</div>
    <div style="font-size:${Math.round(0.16 * PX_PER_IN)}px; font-weight:800; line-height:1.04;">${escapeHtml(nameForCard)}</div>
    ${emp.position ? `<div style="font-size:${Math.round(0.09 * PX_PER_IN)}px; color:#c4ccd8; margin-top:${Math.round(0.02 * PX_PER_IN)}px; letter-spacing:0.5px; text-transform:uppercase;">${escapeHtml(emp.position)}</div>` : ''}
  `;
  body.appendChild(tag);

  const row = document.createElement('div');
  row.style.cssText = `display:flex; align-items:flex-end; justify-content:space-between;
    margin-top:${Math.round(0.07 * PX_PER_IN)}px; gap:${Math.round(0.1 * PX_PER_IN)}px;`;
  const meta = document.createElement('div');
  meta.style.cssText = `font-size:${Math.round(0.06 * PX_PER_IN)}px; color:#8a93a0;
    letter-spacing:0.5px; text-transform:uppercase; line-height:1.3; max-width:${Math.round(1.25 * PX_PER_IN)}px;`;
  meta.textContent = 'Electrical & Mechanical Field Services';
  const qrWrap = document.createElement('div');
  qrWrap.style.cssText = `background:#fff; padding:${Math.round(0.03 * PX_PER_IN)}px;
    border-radius:${Math.round(0.03 * PX_PER_IN)}px; flex:none;`;
  const qrImg = document.createElement('img');
  qrImg.src = qrDataUrl;
  const qrSize = Math.round(0.54 * PX_PER_IN);
  qrImg.style.cssText = `width:${qrSize}px; height:${qrSize}px; display:block;`;
  qrWrap.appendChild(qrImg);
  row.appendChild(meta);
  row.appendChild(qrWrap);
  body.appendChild(row);

  card.appendChild(body);
  return card;
}

// "Sanchez, Hector" -> "Hector Sanchez" for display on the card.
function formatName(name) {
  const parts = name.split(',').map((s) => s.trim());
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return name;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Generate a single PDF containing one card per selected employee.
export async function generateCardsPdf(employees, onProgress = () => {}) {
  const logoData = await toDataUrl(logoUrl);
  const doc = new jsPDF({ unit: 'in', format: [CARD_W_IN, CARD_H_IN], orientation: 'landscape' });

  // Offscreen host so the cards render but aren't visible.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed; left:-99999px; top:0; width:0; height:0; overflow:hidden;';
  document.body.appendChild(host);

  try {
    for (let i = 0; i < employees.length; i++) {
      onProgress(i + 1, employees.length);
      const node = await buildCardNode(employees[i], logoData);
      host.appendChild(node);
      // Wait a tick so images are laid out before capture.
      await new Promise((r) => setTimeout(r, 30));
      const canvas = await html2canvas(node, {
        width: CARD_W_PX,
        height: CARD_H_PX,
        scale: 1,
        backgroundColor: NAVY,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) doc.addPage([CARD_W_IN, CARD_H_IN], 'landscape');
      doc.addImage(imgData, 'JPEG', 0, 0, CARD_W_IN, CARD_H_IN);
      host.removeChild(node);
    }
    return doc;
  } finally {
    document.body.removeChild(host);
  }
}

export async function downloadCardsPdf(employees, onProgress) {
  const doc = await generateCardsPdf(employees, onProgress);
  const name = employees.length === 1
    ? `ID-Card-${employees[0].slug}.pdf`
    : `ID-Cards-${employees.length}-employees.pdf`;
  doc.save(name);
}
