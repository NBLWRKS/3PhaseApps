// Fills the real PDF forms with the applicant's answers using pdf-lib, entirely
// in the browser. Returns an array of { name, blob } for download/email.
import { PDFDocument } from 'pdf-lib';
import { PACKET } from './applicationPacket';

// Resolve the correct PDF file for a form given the chosen language.
function fileFor(form, lang) {
  if (form.files.all) return form.files.all;
  return form.files[lang] || form.files.en;
}

// Set a single mapped field on a pdf-lib form from an answer value.
function applyField(pdfForm, field, value) {
  if (value == null || value === '') {
    if (field.type === 'fixed' && field.value) value = field.value;
    else return;
  }
  try {
    if (field.type === 'fixed') {
      pdfForm.getTextField(field.pdf).setText(field.value || '');
      return;
    }
    if (field.type === 'yesno') {
      // value is 'yes' | 'no'; each maps to its own checkbox
      const target = value === 'yes' ? field.pdf.yes : field.pdf.no;
      pdfForm.getCheckBox(target).check();
      return;
    }
    if (field.type === 'radio') {
      // value matches one option; that option names either a checkbox or a radiogroup choice
      const opt = field.options.find((o) => o.value === value);
      if (!opt) return;
      if (typeof opt.pdf === 'string') {
        pdfForm.getCheckBox(opt.pdf).check();
      } else if (opt.pdf.field) {
        pdfForm.getRadioGroup(opt.pdf.field).select(opt.pdf.on);
      }
      return;
    }
    if (field.type === 'state') {
      // I-9 State is a dropdown; select the value if valid, else set text fallback
      try { pdfForm.getDropdown(field.pdf).select(value); }
      catch { try { pdfForm.getTextField(field.pdf).setText(value); } catch {} }
      return;
    }
    if (field.type === 'ssn') {
      // SSN fields often cap at 9 chars — strip any dashes/spaces the user typed.
      const digits = String(value).replace(/\D/g, '');
      pdfForm.getTextField(field.pdf).setText(digits);
      return;
    }
    // default text-like; clamp to the field's maxLength if it has one
    const tf = pdfForm.getTextField(field.pdf);
    let text = String(value);
    try { const max = tf.getMaxLength?.(); if (max && text.length > max) text = text.slice(0, max); } catch {}
    tf.setText(text);
  } catch (e) {
    // Field missing/renamed — skip rather than fail the whole packet.
    console.warn('Could not set field', field.pdf, e.message);
  }
}

// answers shape: { [formKey]: { [fieldId]: value } }
// fieldId is the pdf name for simple fields, or the section-scoped key we assign.
export async function buildFilledPdfs(answers, lang) {
  const results = [];
  for (const form of PACKET) {
    const url = fileFor(form, lang);
    const bytes = await fetch(url).then((r) => r.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const pdfForm = doc.getForm();
    const formAnswers = answers[form.key] || {};

    for (const section of form.sections) {
      for (const field of section.fields) {
        const id = fieldId(field);
        applyField(pdfForm, field, formAnswers[id]);
      }
    }
    // Flatten so the values are baked in and can't be edited after the fact.
    try { pdfForm.flatten(); } catch (e) { /* some XFA forms resist flatten; leave interactive */ }
    const out = await doc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    results.push({ key: form.key, name: fileName(form, lang), blob });
  }
  return results;
}

// A stable id for a field in our answers object.
export function fieldId(field) {
  if (field.type === 'radio' || field.type === 'yesno') {
    // group fields keyed by label text (unique within a form section)
    return 'grp:' + (field.label?.en || JSON.stringify(field.pdf));
  }
  return typeof field.pdf === 'string' ? field.pdf : JSON.stringify(field.pdf);
}

function fileName(form, lang) {
  const map = {
    job: 'Employment-Application',
    w4: 'W-4',
    i9: 'I-9-Section1',
    dd: 'Direct-Deposit',
  };
  return `${map[form.key] || form.key}.pdf`;
}
