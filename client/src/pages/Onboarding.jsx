import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  CheckCircle2, Circle, Loader2, FileText, ChevronLeft, ChevronRight, ShieldCheck, GraduationCap,
  Languages, ClipboardCheck, XCircle, RotateCcw, Info, Presentation,
} from 'lucide-react';
import logo from '@/assets/logo.jpg';

// ---------------------------------------------------------------------------
// UI strings (English / Spanish)
// ---------------------------------------------------------------------------
const T = {
  en: {
    onboarding: 'Onboarding',
    title: 'Employee Onboarding',
    intro: 'Select your name, then complete each training course below.',
    viewCreds: 'View Safety Credentials',
    yourName: 'Your name',
    selectName: '— Select your name —',
    noCourses: 'No training courses available yet.',
    completed: 'Completed',
    notStarted: 'Not started',
    score: 'Score',
    start: 'Start',
    review: 'Review',
    selectFirst: 'Select your name above to begin a course.',
    slides: (n) => `${n} slides`,
    quizTag: (n) => `Quiz · ${n} questions`,
    back: 'Back to courses',
    slideOf: (i, n) => `Slide ${i} of ${n}`,
    prev: 'Previous',
    next: 'Next',
    finishSlides: 'Continue',
    toQuiz: 'Take the quiz',
    agree: 'By continuing, I agree that I have completed all training related to this course.',
    complete: 'Complete course',
    saveError: 'Could not record your completion. Please try again.',
    quiz: 'Quiz',
    quizIntro: (p) => `Answer every question. You need ${p}% or higher to pass. You can retake the quiz if needed.`,
    question: (i, n) => `Question ${i} of ${n}`,
    submit: 'Submit answers',
    answerAll: (n) => `${n} question(s) left to answer`,
    passed: 'You passed!',
    failed: 'Not quite — please try again',
    yourScore: (c, n, s) => `You answered ${c} of ${n} correctly (${s}%).`,
    needed: (p) => `A score of ${p}% is needed to pass.`,
    wrongNote: 'Questions you missed are marked below. Review the slides and retake the quiz.',
    retake: 'Retake quiz',
    reviewSlides: 'Review slides',
    done: 'Back to courses',
    courseDone: 'Course completed',
    courseDoneMsg: 'Your completion has been recorded.',
    quizLoadError: 'Could not load the quiz. Please try again.',
    pdfFallback: 'This course is available in one language only.',
    fullSize: 'Open full size',
  },
  es: {
    onboarding: 'Integración',
    title: 'Integración de Empleados',
    intro: 'Seleccione su nombre y luego complete cada curso de capacitación.',
    viewCreds: 'Ver credenciales de seguridad',
    yourName: 'Su nombre',
    selectName: '— Seleccione su nombre —',
    noCourses: 'Aún no hay cursos de capacitación disponibles.',
    completed: 'Completado',
    notStarted: 'Sin comenzar',
    score: 'Calificación',
    start: 'Comenzar',
    review: 'Repasar',
    selectFirst: 'Seleccione su nombre arriba para comenzar un curso.',
    slides: (n) => `${n} diapositivas`,
    quizTag: (n) => `Cuestionario · ${n} preguntas`,
    back: 'Volver a los cursos',
    slideOf: (i, n) => `Diapositiva ${i} de ${n}`,
    prev: 'Anterior',
    next: 'Siguiente',
    finishSlides: 'Continuar',
    toQuiz: 'Hacer el cuestionario',
    agree: 'Al continuar, confirmo que he completado toda la capacitación de este curso.',
    complete: 'Completar curso',
    saveError: 'No se pudo registrar su avance. Inténtelo de nuevo.',
    quiz: 'Cuestionario',
    quizIntro: (p) => `Responda todas las preguntas. Necesita ${p}% o más para aprobar. Puede repetir el cuestionario si es necesario.`,
    question: (i, n) => `Pregunta ${i} de ${n}`,
    submit: 'Enviar respuestas',
    answerAll: (n) => `Faltan ${n} pregunta(s) por responder`,
    passed: '¡Aprobó!',
    failed: 'Casi — inténtelo de nuevo',
    yourScore: (c, n, s) => `Respondió correctamente ${c} de ${n} (${s}%).`,
    needed: (p) => `Se necesita ${p}% para aprobar.`,
    wrongNote: 'Las preguntas incorrectas están marcadas abajo. Repase las diapositivas y vuelva a intentarlo.',
    retake: 'Repetir cuestionario',
    reviewSlides: 'Repasar diapositivas',
    done: 'Volver a los cursos',
    courseDone: 'Curso completado',
    courseDoneMsg: 'Su avance ha sido registrado.',
    quizLoadError: 'No se pudo cargar el cuestionario. Inténtelo de nuevo.',
    pdfFallback: 'Este curso solo está disponible en un idioma.',
    fullSize: 'Ver en tamaño completo',
  },
};

const LANG_KEY = 'onboarding.lang';
function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* storage unavailable */ }
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

// ---------------------------------------------------------------------------
// Layout pieces (defined outside the page so children keep their state)
// ---------------------------------------------------------------------------
function LangToggle({ lang, setLang }) {
  return (
    <div className="flex items-center gap-1.5">
      <Languages className="w-4 h-4 text-muted-foreground hidden sm:block" />
      <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Language / Idioma">
        {[['en', 'English'], ['es', 'Español']].map(([code, label]) => (
          <button key={code} onClick={() => setLang(code)} aria-pressed={lang === code}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${lang === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Shell({ lang, setLang, children, wide }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-card border-b border-border">
        <div className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 h-14 flex items-center justify-between gap-2.5`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5 truncate">{T[lang].onboarding}</span>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>
      </header>
      <main className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 py-6`}>{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide viewer
// ---------------------------------------------------------------------------
function SlideViewer({ course, lang, t, index, setIndex, onFinish, finishLabel }) {
  const count = course.slides[lang] || course.slides.en;
  const i = Math.min(index, count - 1);
  const atEnd = i === count - 1;
  const touch = useRef(null);

  const go = useCallback((d) => setIndex((x) => Math.max(0, Math.min(count - 1, Math.min(x, count - 1) + d))), [count, setIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Preload the neighbouring slides so paging feels instant.
  useEffect(() => {
    [i + 1, i + 2, i - 1].forEach((n) => {
      if (n >= 0 && n < count) { const im = new Image(); im.src = base44.onboarding.slideUrl(course.slug, lang, n + 1); }
    });
  }, [i, count, course.slug, lang]);

  return (
    <div>
      <div
        className="rounded-xl border border-border overflow-hidden bg-white flex items-center justify-center select-none min-h-[200px]"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        <img key={`${lang}-${i}`} src={base44.onboarding.slideUrl(course.slug, lang, i + 1)}
          alt={t.slideOf(i + 1, count)} className="block max-w-full w-auto h-auto object-contain" style={{ maxHeight: 'min(62vh, 600px)' }} draggable={false} />
      </div>

      <div className="flex justify-end mt-1">
        <a href={base44.onboarding.slideUrl(course.slug, lang, i + 1)} target="_blank" rel="noreferrer"
          className="text-[11px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline">{t.fullSize}</a>
      </div>
      <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${((i + 1) / count) * 100}%` }} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <button onClick={() => go(-1)} disabled={i === 0}
          className="flex items-center gap-1 px-3.5 py-2 rounded-lg border border-border bg-card text-sm font-medium disabled:opacity-40">
          <ChevronLeft className="w-4 h-4" /> {t.prev}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap" title={t.slideOf(i + 1, count)}>{i + 1} / {count}</span>
        {atEnd ? (
          <button onClick={onFinish}
            className="flex items-center gap-1 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold whitespace-nowrap">
            {finishLabel} <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={() => go(1)}
            className="flex items-center gap-1 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            {t.next} <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
function Quiz({ course, lang, t, employeeId, onPassed, onReviewSlides }) {
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const topRef = useRef(null);

  useEffect(() => {
    setQuiz(null); setError('');
    base44.onboarding.quiz(course.id, lang)
      .then((q) => { setQuiz(q); setAnswers((a) => (a.length === q.questions.length ? a : Array(q.questions.length).fill(null))); })
      .catch(() => setError(t.quizLoadError));
  }, [course.id, lang, t.quizLoadError]);

  const remaining = answers.filter((a) => a == null).length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await base44.onboarding.submitQuiz(course.id, employeeId, lang, answers);
      setResult(r);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (r.passed) onPassed(r.score);
    } catch (e) { alert(e?.message || t.saveError); }
    finally { setSubmitting(false); }
  };
  const retake = () => { setResult(null); setAnswers(Array(quiz.questions.length).fill(null)); topRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  if (error) return <p className="text-sm text-destructive py-8 text-center">{error}</p>;
  if (!quiz) return <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div ref={topRef} className="scroll-mt-4">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">{quiz.title || t.quiz}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t.quizIntro(quiz.pass_pct)}</p>

      {result && (
        <div className={`rounded-xl border p-4 mb-5 ${result.passed ? 'border-green-500/40 bg-green-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <div className="flex items-center gap-2 font-semibold">
            {result.passed ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-amber-600" />}
            {result.passed ? t.passed : t.failed}
          </div>
          <p className="text-sm mt-1">{t.yourScore(result.correct, result.total, result.score)}</p>
          {!result.passed && <p className="text-sm text-muted-foreground mt-1">{t.needed(result.pass_pct)} {t.wrongNote}</p>}
          {!result.passed && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={retake} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                <RotateCcw className="w-4 h-4" /> {t.retake}
              </button>
              <button onClick={onReviewSlides} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card text-sm font-medium">
                <Presentation className="w-4 h-4" /> {t.reviewSlides}
              </button>
            </div>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {quiz.questions.map((q, qi) => {
          const wrong = result && !result.results[qi];
          return (
            <li key={qi} className={`rounded-xl border bg-card p-4 ${wrong ? 'border-amber-500/60' : 'border-border'}`}>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                {t.question(qi + 1, quiz.questions.length)}
                {result && (result.results[qi]
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  : <XCircle className="w-3.5 h-3.5 text-amber-600" />)}
              </div>
              <div className="font-medium mb-3">{q.q}</div>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition ${answers[qi] === oi ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/60'} ${result ? 'pointer-events-none' : ''}`}>
                    <input type="radio" name={`q${qi}`} className="mt-0.5 w-4 h-4 accent-current" checked={answers[qi] === oi} disabled={!!result}
                      onChange={() => setAnswers((a) => a.map((x, j) => (j === qi ? oi : x)))} />
                    <span><span className="font-semibold mr-1">{String.fromCharCode(65 + oi)})</span>{opt}</span>
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {!result && (
        <div className="sticky bottom-0 bg-background/95 backdrop-blur py-3 mt-4 flex items-center justify-between gap-3 border-t border-border">
          <span className="text-xs text-muted-foreground">{remaining > 0 ? t.answerAll(remaining) : ''}</span>
          <button onClick={submit} disabled={remaining > 0 || submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {t.submit}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Acknowledgement (courses without a quiz)
// ---------------------------------------------------------------------------
function Acknowledge({ t, onComplete, saving }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-4 h-4" />
        <span className="text-sm">{t.agree}</span>
      </label>
      <div className="flex justify-end mt-4">
        <button onClick={onComplete} disabled={!agreed || saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} <CheckCircle2 className="w-4 h-4" /> {t.complete}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Onboarding() {
  const [lang, setLangState] = useState(initialLang);
  const [employees, setEmployees] = useState([]);
  const [courses, setCourses] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [completions, setCompletions] = useState({}); // course_id -> { date, score }
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);   // course being taken
  const [step, setStep] = useState('slides');   // 'slides' | 'quiz' | 'ack' | 'done'
  const [slideIndex, setSlideIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const t = T[lang];
  const setLang = (l) => { setLangState(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    Promise.all([base44.onboarding.publicEmployees(), base44.onboarding.publicCourses()])
      .then(([emps, crs]) => { setEmployees(emps || []); setCourses(crs || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCompletions = useCallback((id) => {
    if (!id) { setCompletions({}); return; }
    base44.onboarding.publicCompletions(id)
      .then((rows) => {
        const m = {};
        for (const r of rows || []) m[r.course_id] = { date: r.completed_date, score: r.score };
        setCompletions(m);
      })
      .catch(() => setCompletions({}));
  }, []);
  useEffect(() => { loadCompletions(employeeId); }, [employeeId, loadCompletions]);

  const openCourse = (c) => { setActive(c); setStep(c.kind === 'slides' ? 'slides' : 'ack'); setSlideIndex(0); window.scrollTo(0, 0); };
  const closeCourse = () => { setActive(null); window.scrollTo(0, 0); };
  const markDone = (score) => setCompletions((m) => {
    const prev = m[active.id];
    const best = score == null ? prev?.score ?? null : Math.max(score, prev?.score ?? 0);
    return { ...m, [active.id]: { date: prev?.date || new Date().toISOString(), score: best } };
  });

  const confirmComplete = async () => {
    if (!employeeId || !active) return;
    setSaving(true);
    try {
      await base44.onboarding.complete(employeeId, active.id, lang);
      markDone(null);
      setStep('done');
    } catch { alert(t.saveError); }
    finally { setSaving(false); }
  };

  const courseName = (c) => (c.names && c.names[lang]) || c.name;
  const shellProps = { lang, setLang };

  if (loading) {
    return <Shell {...shellProps}><div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div></Shell>;
  }

  // ----- course being taken -----
  if (active) {
    const isSlides = active.kind === 'slides';
    return (
      <Shell {...shellProps} wide={isSlides && step === 'slides'}>
        <button onClick={closeCourse} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ChevronLeft className="w-4 h-4" /> {t.back}
        </button>
        <h1 className="text-xl font-bold mb-3">{courseName(active)}</h1>

        {active.note && step !== 'done' && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm mb-3">
            <Info className="w-4 h-4 mt-0.5 flex-none text-primary" /> <span>{active.note[lang]}</span>
          </div>
        )}

        {step === 'slides' && isSlides && (
          <SlideViewer course={active} lang={lang} t={t} index={slideIndex} setIndex={setSlideIndex}
            finishLabel={active.quiz ? t.toQuiz : t.finishSlides}
            onFinish={() => { setStep(active.quiz ? 'quiz' : 'ack'); window.scrollTo(0, 0); }} />
        )}

        {step === 'quiz' && (
          <Quiz course={active} lang={lang} t={t} employeeId={employeeId}
            onPassed={(score) => markDone(score)}
            onReviewSlides={() => { setSlideIndex(0); setStep('slides'); window.scrollTo(0, 0); }} />
        )}
        {step === 'quiz' && completions[active.id] && (
          <div className="flex justify-end mt-4">
            <button onClick={closeCourse} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">{t.done}</button>
          </div>
        )}

        {step === 'ack' && (
          <>
            {!isSlides && (
              <>
                <p className="text-xs text-muted-foreground mb-2">{t.pdfFallback}</p>
                <div className="rounded-xl border border-border overflow-hidden bg-card mb-4" style={{ height: '70vh' }}>
                  <iframe title={active.name} src={base44.onboarding.courseFileUrl(active.id)} className="w-full h-full" />
                </div>
              </>
            )}
            <Acknowledge t={t} onComplete={confirmComplete} saving={saving} />
          </>
        )}

        {step === 'done' && (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <div className="font-semibold text-lg">{t.courseDone}</div>
            <p className="text-sm text-muted-foreground mt-1">{t.courseDoneMsg}</p>
            <button onClick={closeCourse} className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">{t.done}</button>
          </div>
        )}
      </Shell>
    );
  }

  // ----- course list -----
  return (
    <Shell {...shellProps}>
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{t.intro}</p>

      <a href="/safety" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6">
        <ShieldCheck className="w-4 h-4" /> {t.viewCreds}
      </a>

      <div className="mb-6">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.yourName}</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full mt-1 bg-card border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">{t.selectName}</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p>{t.noCourses}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {courses.map((c) => {
            const done = completions[c.id];
            const meta = c.kind === 'slides'
              ? [t.slides(c.slides[lang] || c.slides.en), c.quiz ? t.quizTag(c.quiz.questions) : null].filter(Boolean).join(' · ')
              : null;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                {done ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-none" /> : <Circle className="w-5 h-5 text-muted-foreground flex-none" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{courseName(c)}</div>
                  <div className="text-xs text-muted-foreground">
                    {done ? `${t.completed}${done.score != null ? ` · ${t.score}: ${done.score}%` : ''}` : t.notStarted}
                    {meta && <span className="hidden sm:inline"> · {meta}</span>}
                  </div>
                </div>
                <button onClick={() => openCourse(c)} disabled={!employeeId}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex-none">
                  {done ? t.review : t.start}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!employeeId && courses.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-center">{t.selectFirst}</p>
      )}
    </Shell>
  );
}
