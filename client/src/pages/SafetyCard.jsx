import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, parseISO, differenceInDays } from 'date-fns';
import logo from '@/assets/logo.jpg';

function fmt(d) {
  if (!d) return '____________';
  try { return format(parseISO(d), 'MM/dd/yyyy'); } catch { return d; }
}

function statusOf(rec) {
  if (!rec.expires_date) return null;
  try {
    const days = differenceInDays(parseISO(rec.expires_date), new Date());
    if (days < 0) return { label: 'EXPIRED', cls: 'text-red-600 border-red-600' };
    if (days <= 30) return { label: 'EXPIRING SOON', cls: 'text-amber-600 border-amber-600' };
    return { label: 'VALID', cls: 'text-green-700 border-green-700' };
  } catch { return null; }
}

// A single certification card, styled after the physical 3 Phase Conveyor cards.
function CredentialCard({ name, rec }) {
  const st = statusOf(rec);
  // Training and evaluation dates default to the passed date when not set.
  const training = rec.passed_date;
  const evaluation = rec.evaluation_date || rec.passed_date;
  return (
    <div className="bg-white text-neutral-900 border border-neutral-300 rounded-lg shadow-sm px-6 py-5 max-w-md w-full mx-auto">
      {/* Logo replaces the "3 Phase Conveyor" wordmark */}
      <div className="flex justify-center mb-1">
        <img src={logo} alt="3 Phase Conveyor" className="h-10 w-auto" />
      </div>
      <h2 className="text-center font-bold tracking-wide text-sm uppercase mb-1">
        {rec.training}
      </h2>
      {st && (
        <div className="flex justify-center mb-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 border rounded ${st.cls}`}>{st.label}</span>
        </div>
      )}
      <hr className="border-neutral-400 mb-3" />
      <p className="text-center text-xs text-neutral-700 mb-4">
        Has been trained and evaluated in accordance with applicable OSHA standards.
      </p>

      <div className="text-sm space-y-1.5">
        <div className="flex justify-between gap-4">
          <span>Training Date: <span className="font-medium border-b border-neutral-400 px-2">{fmt(training)}</span></span>
          <span>Evaluation Date: <span className="font-medium border-b border-neutral-400 px-2">{fmt(evaluation)}</span></span>
        </div>
        <div>
          Expires: <span className="font-medium border-b border-neutral-400 px-2">{fmt(rec.expires_date)}</span>
          <span className="text-[11px] text-neutral-500 ml-2">(3 Years from Evaluation Date)</span>
        </div>
      </div>

      {/* Employee name + signature sign-off */}
      <div className="flex items-end justify-between mt-6">
        <div className="text-sm">
          <div className="font-semibold">{name}</div>
        </div>
        <div className="text-right">
          <div className="font-[cursive] text-lg leading-none">YS</div>
          <div className="border-t border-neutral-400 text-[10px] text-neutral-500 pt-0.5 mt-0.5">Instructor</div>
        </div>
      </div>
    </div>
  );
}

export default function SafetyCard() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | notfound

  useEffect(() => {
    base44.safety.getPublicCard(slug)
      .then((d) => { setData(d); setState('ok'); })
      .catch(() => setState('notfound'));
  }, [slug]);

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-100 text-neutral-500">Loading…</div>;
  }
  if (state === 'notfound') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 text-neutral-600">
        <div className="text-center">
          <img src={logo} alt="3 Phase Conveyor" className="h-12 w-auto mx-auto mb-3" />
          <p>Credential not found.</p>
        </div>
      </div>
    );
  }

  const records = data.records || [];
  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4">
      <div className="max-w-md mx-auto mb-6 text-center">
        <img src={logo} alt="3 Phase Conveyor" className="h-12 w-auto mx-auto mb-2" />
        <h1 className="text-xl font-bold text-neutral-800">{data.name}</h1>
        <p className="text-sm text-neutral-500">Safety Training Credentials</p>
      </div>

      {records.length === 0 ? (
        <p className="text-center text-neutral-500">No training records on file.</p>
      ) : (
        <div className="space-y-5">
          {records.map((rec) => (
            <CredentialCard key={rec.id} name={data.name} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
