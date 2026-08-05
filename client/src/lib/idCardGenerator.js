// Generates printable ID cards for employees entirely in the browser.
// For each employee we build the approved card layout as a hidden DOM node,
// snapshot it with html2canvas, and place each snapshot on its own CR80-sized
// page in a single PDF. The QR code is generated client-side and points to the
// employee's public credential page.
import qrcodeGen from './qrcode-generator.mjs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import logoUrl from '@/assets/logo.jpg';

const NAVY = '#1A2238';
const RED = '#C0392B';
const GOLD = '#E8B33D';
const GREEN = '#2E7D5B';
const BLUE = '#2C6E9B';

// CR80 card dimensions in inches — PORTRAIT orientation (badge/lanyard).
const CARD_W_IN = 2.125;
const CARD_H_IN = 3.375;

// Render at high pixel density for crisp print output (~300+ DPI).
const PX_PER_IN = 320;
const CARD_W_PX = Math.round(CARD_W_IN * PX_PER_IN);
const CARD_H_PX = Math.round(CARD_H_IN * PX_PER_IN);

function publicCardUrl(slug) {
  const base = window.location.origin || 'https://3phaseapps.com';
  return `${base}/SafetyCredentials/${slug}`;
}

// Render a QR code for `text` to a PNG data URL using the vendored, dependency-
// free generator. Drawn crisp (no smoothing) at a high pixel size for print.
function qrToDataUrl(text, { size = 320, dark = '#000000', light = '#ffffff' } = {}) {
  const qr = qrcodeGen(0, 'M'); // type 0 = auto-fit, error correction level M
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.floor(size / count) || 1;
  const dim = cell * count;
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = dark;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  return canvas.toDataURL('image/png');
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

// Center-crop an image data URL to a square canvas of the given pixel size.
// This guarantees the photo is never stretched/skewed regardless of the
// original upload's aspect ratio or html2canvas timing.
function squareCropDataUrl(dataUrl, sizePx) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      const ctx = canvas.getContext('2d');
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      // Crop from horizontal center; bias slightly toward the top for headshots.
      const sx = (img.naturalWidth - side) / 2;
      const sy = Math.max(0, (img.naturalHeight - side) / 2 - side * 0.08);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, sizePx, sizePx);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Build the portrait card DOM node for one employee: white background, blue top
// bar, vertical layout (logo → photo → name/position → QR at bottom).
async function buildCardNode(emp, logoData) {
  const qrDataUrl = qrToDataUrl(publicCardUrl(emp.slug), {
    size: 300,
    dark: NAVY,
    light: '#ffffff',
  });
  const pSize = Math.round(0.85 * PX_PER_IN);
  const rawPhoto = emp.photo_url ? await toDataUrl(emp.photo_url) : null;
  // Pre-crop to a perfect square so the photo can never appear stretched.
  const photoData = rawPhoto ? await squareCropDataUrl(rawPhoto, pSize * 2) : null;

  const card = document.createElement('div');
  card.style.cssText = `
    width:${CARD_W_PX}px; height:${CARD_H_PX}px; position:relative;
    background:#ffffff; color:${NAVY}; overflow:hidden;
    font-family:'Helvetica Neue',Arial,sans-serif; box-sizing:border-box;
    display:flex; flex-direction:column; align-items:center;
    padding-bottom:${Math.round(0.1 * PX_PER_IN)}px;
  `;

  // Blue top bar
  const rail = document.createElement('div');
  rail.style.cssText = `width:100%; height:${Math.round(0.06 * PX_PER_IN)}px; flex:none; background:${BLUE};`;
  card.appendChild(rail);

  // Logo (no white box needed — card is already white)
  const logoImg = document.createElement('img');
  logoImg.src = logoData;
  logoImg.style.cssText = `width:${Math.round(1.05 * PX_PER_IN)}px; display:block; flex:none;
    margin-top:${Math.round(0.12 * PX_PER_IN)}px;`;
  card.appendChild(logoImg);

  // Photo (square, navy border)
  const photoBox = document.createElement('div');
  photoBox.style.cssText = `flex:none; width:${pSize}px; height:${pSize}px;
    border-radius:${Math.round(0.06 * PX_PER_IN)}px; overflow:hidden;
    border:${Math.round(0.02 * PX_PER_IN)}px solid ${NAVY}; background:#0e1426;
    margin-top:${Math.round(0.1 * PX_PER_IN)}px; display:flex; align-items:center; justify-content:center;`;
  if (photoData) {
    const img = document.createElement('img');
    img.src = photoData;
    img.style.cssText = 'width:100%; height:100%; object-fit:cover; object-position:center top;';
    photoBox.appendChild(img);
  } else {
    photoBox.style.color = '#c4ccd8';
    photoBox.style.fontSize = `${Math.round(0.42 * PX_PER_IN)}px`;
    photoBox.textContent = '👤';
  }
  card.appendChild(photoBox);

  // Name + position block (centered)
  const tag = document.createElement('div');
  tag.style.cssText = `flex:none; text-align:center; margin-top:${Math.round(0.08 * PX_PER_IN)}px;
    padding:0 ${Math.round(0.1 * PX_PER_IN)}px;`;
  const nameForCard = formatName(emp.name);
  const positionText = (emp.position || '').trim();
  tag.innerHTML = `
    <div style="font-size:${Math.round(0.06 * PX_PER_IN)}px; letter-spacing:2px; text-transform:uppercase; color:${BLUE}; font-weight:700; margin-bottom:${Math.round(0.015 * PX_PER_IN)}px;">Employee ID</div>
    <div style="font-size:${Math.round(0.125 * PX_PER_IN)}px; font-weight:800; line-height:1.05; color:${NAVY};">${escapeHtml(nameForCard)}</div>
    ${positionText ? `<div style="font-size:${Math.round(0.085 * PX_PER_IN)}px; color:${NAVY}; margin-top:${Math.round(0.02 * PX_PER_IN)}px; letter-spacing:0.5px; text-transform:uppercase; font-weight:600;">${escapeHtml(positionText)}</div>` : ''}
    <div style="font-size:${Math.round(0.055 * PX_PER_IN)}px; color:#6b7280; margin-top:${Math.round(0.03 * PX_PER_IN)}px; letter-spacing:0.5px; text-transform:uppercase; line-height:1.3;">Electrical &amp; Mechanical<br>Field Services</div>
  `;
  card.appendChild(tag);

  // QR pinned toward the bottom (dark on white, no box needed)
  const qrWrap = document.createElement('div');
  qrWrap.style.cssText = `flex:none; margin-top:auto; padding:${Math.round(0.04 * PX_PER_IN)}px;`;
  const qrImg = document.createElement('img');
  qrImg.src = qrDataUrl;
  const qrSize = Math.round(0.7 * PX_PER_IN);
  qrImg.style.cssText = `width:${qrSize}px; height:${qrSize}px; display:block;`;
  qrWrap.appendChild(qrImg);
  const scan = document.createElement('div');
  scan.style.cssText = `font-size:${Math.round(0.045 * PX_PER_IN)}px; letter-spacing:1px;
    text-transform:uppercase; color:${NAVY}; font-weight:700; text-align:center; margin-top:2px;`;
  scan.textContent = 'Scan';
  qrWrap.appendChild(scan);
  card.appendChild(qrWrap);

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
  const doc = new jsPDF({ unit: 'in', format: [CARD_W_IN, CARD_H_IN], orientation: 'portrait' });

  // Offscreen host (positioned off-screen but with real size, so html2canvas
  // measures layout correctly).
  const host = document.createElement('div');
  host.style.cssText = `position:fixed; left:-99999px; top:0; width:${CARD_W_PX}px; height:${CARD_H_PX}px; overflow:hidden; opacity:1; pointer-events:none;`;
  document.body.appendChild(host);

  try {
    for (let i = 0; i < employees.length; i++) {
      onProgress(i + 1, employees.length);
      const node = await buildCardNode(employees[i], logoData);
      host.appendChild(node);
      // Let layout + images settle before capture.
      await new Promise((r) => setTimeout(r, 80));
      const canvas = await html2canvas(node, {
        width: CARD_W_PX,
        height: CARD_H_PX,
        scale: 1,
        backgroundColor: NAVY,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) doc.addPage([CARD_W_IN, CARD_H_IN], 'portrait');
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
