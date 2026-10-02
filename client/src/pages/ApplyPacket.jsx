import React, { useState } from 'react';
import { PACKET } from '@/lib/applicationPacket';
import { buildFilledPdfs, fieldId } from '@/lib/fillPacket';
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, Loader2, Download, FileText, ArrowRight } from 'lucide-react';
import logo from '@/assets/logo.jpg';

const T = {
  en: {
    welcome: 'Employment Application', pick: 'Choose your language', start: 'Start',
    step: 'Step', of: 'of', next: 'Next', back: 'Back', review: 'Review & Submit',
    finish: 'Finish & Submit', downloading: 'Submitting your documents…',
    optional: 'This form is optional — you can skip it.', skip: 'Skip this form',
    reviewTitle: 'Review your packet', reviewNote: 'When you tap Finish, your completed packet is submitted securely to 3 Phase Conveyor. A copy also downloads to this device for your records.',
    done: 'Your documents are ready', doneNote: 'The completed PDFs have downloaded to this device. Your email app should have opened, addressed to HR — attach the downloaded files and press send. If it did not open, use the button below.',
    openEmail: 'Open email to HR', redownload: 'Download PDFs again',
    lang: 'English',
  },
  es: {
    welcome: 'Solicitud de Empleo', pick: 'Elija su idioma', start: 'Comenzar',
    step: 'Paso', of: 'de', next: 'Siguiente', back: 'Atrás', review: 'Revisar y Enviar',
    finish: 'Finalizar y Enviar', downloading: 'Enviando sus documentos…',
    optional: 'Este formulario es opcional — puede omitirlo.', skip: 'Omitir este formulario',
    reviewTitle: 'Revise su paquete', reviewNote: 'Al tocar Finalizar, sus PDF completados se descargarán en este dispositivo y se abrirá su correo, dirigido a RR. HH. Adjunte los archivos descargados y envíe.',
    done: 'Sus documentos están listos', doneNote: 'Los PDF completados se han descargado en este dispositivo. Su aplicación de correo debería haberse abierto, dirigida a RR. HH. — adjunte los archivos descargados y presione enviar. Si no se abrió, use el botón de abajo.',
    openEmail: 'Abrir correo a RR. HH.', redownload: 'Descargar los PDF de nuevo',
    lang: 'Español',
  },
};

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export default function ApplyPacket() {
  const [lang, setLang] = useState(null);         // null until chosen
  const [stepIdx, setStepIdx] = useState(-1);     // -1 = intro; 0..N-1 forms; N = review; N+1 = done
  const [answers, setAnswers] = useState({});     // { formKey: { fieldId: value } }
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(null);     // array of {name, blob}
  const [submitOk, setSubmitOk] = useState(false);

  const t = lang ? T[lang] : T.en;
  const forms = PACKET;
  const N = forms.length;

  const setAns = (formKey, id, val) =>
    setAnswers((a) => ({ ...a, [formKey]: { ...(a[formKey] || {}), [id]: val } }));

  // ----- intro / language selection -----
  if (stepIdx === -1) {
    return (
      <Shell>
        <div className="text-center">
          <img src={logo} alt="3 Phase Conveyor" className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-navy mb-1">{T.en.welcome} / {T.es.welcome}</h1>
          <p className="text-muted-foreground text-sm mb-6">{T.en.pick} · {T.es.pick}</p>
          <div className="flex gap-3 justify-center">
            {['en', 'es'].map((l) => (
              <button key={l} onClick={() => { setLang(l); setStepIdx(0); }}
                className="px-6 py-3 rounded-xl bg-navy text-white font-semibold hover:opacity-90 min-w-[120px]">
                {T[l].lang}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-8 max-w-sm mx-auto">
            You will fill out a short packet of new-hire forms, then send the completed PDFs to HR from your own email app.
          </p>
        </div>
      </Shell>
    );
  }

  // ----- done -----
  if (stepIdx === N + 1) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-navy mb-2">
            {submitOk ? (lang === 'es' ? 'Solicitud enviada' : 'Application submitted') : (lang === 'es' ? 'Descargue y envíe' : 'Please download & send')}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {submitOk
              ? (lang === 'es'
                  ? 'Su paquete completo fue enviado de forma segura a 3 Phase Conveyor. También se descargó una copia a este dispositivo para sus registros.'
                  : 'Your completed packet was securely submitted to 3 Phase Conveyor. A copy was also downloaded to this device for your records.')
              : (lang === 'es'
                  ? 'No pudimos enviar su paquete automáticamente. Sus PDF se descargaron a este dispositivo — entréguelos a Recursos Humanos.'
                  : "We couldn't submit your packet automatically. Your PDFs downloaded to this device — please hand them to HR.")}
          </p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            {submitOk && (
              <a href="/onboarding" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-navy text-white font-semibold">
                {lang === 'es' ? 'Continuar a la capacitación' : 'Continue to Training'} <ArrowRight className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => downloadAll(filled)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm">
              <Download className="w-4 h-4" /> {t.redownload}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- review -----
  if (stepIdx === N) {
    return (
      <Shell>
        <Progress forms={forms} current={N} t={t} />
        <h2 className="text-xl font-bold text-navy mb-1">{t.reviewTitle}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t.reviewNote}</p>
        <div className="space-y-2 mb-6">
          {forms.map((f, i) => {
            const count = Object.keys(answers[f.key] || {}).length;
            return (
              <button key={f.key} onClick={() => setStepIdx(i)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left hover:bg-secondary">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-navy" />
                  <span className="font-medium">{f.title[lang]}</span>
                </span>
                <span className="text-xs text-muted-foreground">{count > 0 ? `${count} filled` : '—'}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => setStepIdx(N - 1)} className="flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="w-4 h-4" /> {t.back}
          </button>
          <button onClick={finish} disabled={busy}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-60">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.downloading}</> : <><CheckCircle2 className="w-4 h-4" /> {t.finish}</>}
          </button>
        </div>
      </Shell>
    );
  }

  // ----- a form step -----
  const form = forms[stepIdx];
  return (
    <Shell>
      <Progress forms={forms} current={stepIdx} t={t} />
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-1">{t.step} {stepIdx + 1} {t.of} {N}</div>
        <h2 className="text-xl font-bold text-navy">{form.title[lang]}</h2>
        {form.note && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{form.note[lang]}</p>}
      </div>

      {form.sections.map((section, si) => (
        <div key={si} className="mb-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">{section.title[lang]}</h3>
          <div className="space-y-3">
            {section.fields.map((field, fi) => (
              <FieldInput key={fi} field={field} lang={lang}
                value={(answers[form.key] || {})[fieldId(field)]}
                onChange={(v) => setAns(form.key, fieldId(field), v)} />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <button onClick={() => setStepIdx((s) => s - 1)} className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="w-4 h-4" /> {t.back}
        </button>
        <button onClick={() => setStepIdx((s) => s + 1)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-navy text-white font-semibold">
          {stepIdx === N - 1 ? t.review : t.next} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </Shell>
  );

  async function finish() {
    setBusy(true);
    try {
      const pdfs = await buildFilledPdfs(answers, lang);
      setFilled(pdfs);
      // Upload the completed packet to the server (saved for HR to access).
      const API_BASE = import.meta.env.VITE_API_BASE || '/api';
      const fd = new FormData();
      fd.append('applicant', guessApplicantName(answers));
      fd.append('lang', lang);
      pdfs.forEach(({ name, blob }) => fd.append('files', blob, name));
      let uploaded = false;
      try {
        const res = await fetch(`${API_BASE}/applications/submit`, { method: 'POST', body: fd });
        uploaded = res.ok;
      } catch { uploaded = false; }
      setSubmitOk(uploaded);
      // Always also offer the applicant a local copy as a courtesy/backup.
      downloadAll(pdfs);
      setStepIdx(N + 1);
    } catch (e) {
      alert('Something went wrong preparing your documents. Please try again.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  }
}

// Best-effort applicant name from the job-application answers (server also
// defaults if this comes back empty).
function guessApplicantName(answers) {
  const flat = {};
  for (const form of Object.values(answers || {})) {
    for (const [k, v] of Object.entries(form || {})) {
      if (typeof v === 'string' && v.trim()) flat[k.toLowerCase()] = v.trim();
    }
  }
  const find = (...keys) => {
    for (const want of keys) {
      const hit = Object.keys(flat).find((k) => k.includes(want));
      if (hit) return flat[hit];
    }
    return '';
  };
  const full = find('full name', 'fullname', 'name of applicant', 'applicant name');
  if (full) return full;
  const combined = [find('first'), find('last')].filter(Boolean).join(' ').trim();
  return combined || 'Unnamed applicant';
}

function downloadAll(pdfs) {
  if (!pdfs) return;
  pdfs.forEach(({ name, blob }, i) => {
    setTimeout(() => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, i * 400); // stagger so browsers allow multiple downloads
  });
}

// ---------- small components ----------
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-border p-5 sm:p-6">
        {children}
      </div>
    </div>
  );
}

function Progress({ forms, current, t }) {
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {forms.map((f, i) => (
        <div key={f.key} className="flex-1 flex items-center gap-1.5">
          {i < current ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-none" />
            : i === current ? <Circle className="w-4 h-4 text-navy fill-navy/10 flex-none" />
            : <Circle className="w-4 h-4 text-neutral-300 flex-none" />}
          <div className={`h-1 flex-1 rounded ${i < current ? 'bg-green-600' : 'bg-neutral-200'}`} />
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, lang, value, onChange }) {
  const label = field.label?.[lang] || field.label?.en || '';
  if (field.type === 'fixed') {
    return (
      <div>
        <label className="text-sm font-medium text-navy">{label}</label>
        <div className="mt-1 px-3 py-2 rounded-lg border border-border bg-muted text-sm text-muted-foreground">{field.value}</div>
      </div>
    );
  }
  if (field.type === 'yesno') {
    return (
      <div>
        <label className="text-sm font-medium text-navy block mb-1.5">{label}</label>
        <div className="flex gap-2">
          {[['yes', lang === 'es' ? 'Sí' : 'Yes'], ['no', 'No']].map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => onChange(v)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium ${value === v ? 'bg-navy text-white border-navy' : 'border-border bg-card'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === 'radio') {
    return (
      <div>
        <label className="text-sm font-medium text-navy block mb-1.5">{label}</label>
        <div className="space-y-1.5">
          {field.options.map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(o.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${value === o.value ? 'bg-navy text-white border-navy' : 'border-border bg-card'}`}>
              {o.label[lang]}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === 'state') {
    return (
      <div>
        <label className="text-sm font-medium text-navy">{label}</label>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-navy">
          <option value="">—</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    );
  }
  const inputType = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
  return (
    <div>
      <label className="text-sm font-medium text-navy">{label}</label>
      <input type={inputType} value={value || ''} onChange={(e) => onChange(e.target.value)}
        inputMode={field.type === 'ssn' || field.type === 'tel' ? 'numeric' : undefined}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-navy" />
    </div>
  );
}
