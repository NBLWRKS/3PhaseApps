// Maps clean web-form questions to the real AcroForm field names in each PDF.
// Only employee-fillable fields are included (I-9 Section 1, W-4 page 1, etc.).
// Each form lists `sections` of questions; on export we load the real PDF and
// write these values into the named fields with pdf-lib.

export const PACKET = [
  {
    key: 'job',
    // The job application file is chosen by language at runtime (en/es).
    files: { en: '/apply-forms/job-application-en.pdf', es: '/apply-forms/job-application-es.pdf' },
    title: { en: 'Employment Application', es: 'Solicitud de Empleo' },
    sections: [
      {
        title: { en: 'Applicant Information', es: 'Información del Solicitante' },
        fields: [
          { pdf: 'Full Name', type: 'text', label: { en: 'Full Name', es: 'Nombre Completo' } },
          { pdf: 'Address', type: 'text', label: { en: 'Address', es: 'Dirección' } },
          { pdf: 'City/State/Zip', type: 'text', label: { en: 'City / State / Zip', es: 'Ciudad / Estado / Código Postal' } },
          { pdf: 'Phone Number', type: 'tel', label: { en: 'Phone Number', es: 'Número de Teléfono' } },
          { pdf: 'Email Address', type: 'email', label: { en: 'Email Address', es: 'Correo Electrónico' } },
          { pdf: 'Position Applied For', type: 'text', label: { en: 'Position Applied For', es: 'Puesto Solicitado' } },
          { pdf: 'Date Available toStart', type: 'text', label: { en: 'Date Available to Start', es: 'Fecha Disponible para Iniciar' } },
        ],
      },
      {
        title: { en: 'Work Authorization', es: 'Autorización de Trabajo' },
        fields: [
          { pdf: { yes: 'Yes', no: 'No' }, type: 'yesno', label: { en: 'Are you legally authorized to work in the U.S.?', es: '¿Está autorizado(a) legalmente para trabajar en U.S.?' } },
          { pdf: { yes: 'Yes_1', no: 'No_1' }, type: 'yesno', label: { en: 'Will you now or in the future require sponsorship for employment?', es: '¿Requerirá patrocinio para empleo ahora o en el futuro?' } },
        ],
      },
      {
        title: { en: 'Education', es: 'Educación' },
        fields: [
          { pdf: 'High School', type: 'text', label: { en: 'High School — Name', es: 'Preparatoria — Nombre' } },
          { pdf: 'High School_1', type: 'text', label: { en: 'High School — Degree / Status', es: 'Preparatoria — Título / Estatus' } },
          { pdf: 'College/University', type: 'text', label: { en: 'College / University — Name', es: 'Universidad — Nombre' } },
          { pdf: 'College/University_1', type: 'text', label: { en: 'College / University — Degree / Status', es: 'Universidad — Título / Estatus' } },
          { pdf: 'Other', type: 'text', label: { en: 'Other — Name', es: 'Otro — Nombre' } },
          { pdf: 'Other_1', type: 'text', label: { en: 'Other — Degree / Status', es: 'Otro — Título / Estatus' } },
        ],
      },
      {
        title: { en: 'Certification & Signature', es: 'Certificación y Firma' },
        fields: [
          { pdf: 'Signature', type: 'text', label: { en: 'Signature (type your full name)', es: 'Firma (escriba su nombre completo)' } },
          { pdf: 'Date', type: 'text', label: { en: 'Date', es: 'Fecha' } },
        ],
      },
    ],
  },

  {
    key: 'w4',
    files: { all: '/apply-forms/w4.pdf' },
    title: { en: 'W-4 (Federal Tax Withholding)', es: 'W-4 (Retención de Impuestos Federales)' },
    note: {
      en: 'Only Step 1 is required for most new hires. Steps 2–4 are optional. You will sign the printed W-4 in person.',
      es: 'Para la mayoría, solo se requiere el Paso 1. Los Pasos 2 a 4 son opcionales. Firmará el W-4 impreso en persona.',
    },
    sections: [
      {
        title: { en: 'Step 1 — Personal Information', es: 'Paso 1 — Información Personal' },
        fields: [
          { pdf: 'topmostSubform[0].Page1[0].Step1a[0].f1_01[0]', type: 'text', label: { en: 'First name and middle initial', es: 'Nombre y segundo nombre (inicial)' } },
          { pdf: 'topmostSubform[0].Page1[0].Step1a[0].f1_02[0]', type: 'text', label: { en: 'Last name', es: 'Apellido' } },
          { pdf: 'topmostSubform[0].Page1[0].Step1a[0].f1_03[0]', type: 'text', label: { en: 'Address', es: 'Dirección' } },
          { pdf: 'topmostSubform[0].Page1[0].Step1a[0].f1_04[0]', type: 'text', label: { en: 'City, state, and ZIP', es: 'Ciudad, estado y código postal' } },
          { pdf: 'topmostSubform[0].Page1[0].f1_05[0]', type: 'ssn', label: { en: 'Social Security Number', es: 'Número de Seguro Social' } },
          {
            type: 'radio',
            label: { en: 'Filing status (Step 1c)', es: 'Estado civil (Paso 1c)' },
            options: [
              { value: 'single', pdf: 'topmostSubform[0].Page1[0].c1_1[0]', label: { en: 'Single or Married filing separately', es: 'Soltero(a) o Casado(a) declarando por separado' } },
              { value: 'married', pdf: 'topmostSubform[0].Page1[0].c1_1[1]', label: { en: 'Married filing jointly / Qualifying surviving spouse', es: 'Casado(a) declarando conjuntamente' } },
              { value: 'hoh', pdf: 'topmostSubform[0].Page1[0].c1_1[2]', label: { en: 'Head of household', es: 'Cabeza de familia' } },
            ],
          },
        ],
      },
    ],
  },

  {
    key: 'i9',
    files: { all: '/apply-forms/i9.pdf' },
    title: { en: 'I-9 (Employment Eligibility) — Section 1', es: 'I-9 (Elegibilidad de Empleo) — Sección 1' },
    note: {
      en: 'Complete Section 1 only. Your employer completes the rest in person with your ID documents.',
      es: 'Complete solo la Sección 1. Su empleador completa el resto en persona con sus documentos de identidad.',
    },
    sections: [
      {
        title: { en: 'Your Information', es: 'Su Información' },
        fields: [
          { pdf: 'Last Name (Family Name)', type: 'text', label: { en: 'Last Name (Family Name)', es: 'Apellido' } },
          { pdf: 'First Name Given Name', type: 'text', label: { en: 'First Name (Given Name)', es: 'Nombre' } },
          { pdf: 'Employee Middle Initial (if any)', type: 'text', label: { en: 'Middle Initial (if any)', es: 'Inicial del segundo nombre (si aplica)' } },
          { pdf: 'Employee Other Last Names Used (if any)', type: 'text', label: { en: 'Other Last Names Used (if any)', es: 'Otros apellidos usados (si aplica)' } },
          { pdf: 'Address Street Number and Name', type: 'text', label: { en: 'Address (Street Number and Name)', es: 'Dirección (Número y Calle)' } },
          { pdf: 'Apt Number (if any)', type: 'text', label: { en: 'Apt. Number (if any)', es: 'Número de Apartamento (si aplica)' } },
          { pdf: 'City or Town', type: 'text', label: { en: 'City or Town', es: 'Ciudad' } },
          { pdf: 'State', type: 'state', label: { en: 'State', es: 'Estado' } },
          { pdf: 'ZIP Code', type: 'text', label: { en: 'ZIP Code', es: 'Código Postal' } },
          { pdf: 'Date of Birth mmddyyyy', type: 'text', label: { en: 'Date of Birth (mm/dd/yyyy)', es: 'Fecha de Nacimiento (mm/dd/yyyy)' } },
          { pdf: 'US Social Security Number', type: 'ssn', label: { en: 'U.S. Social Security Number', es: 'Número de Seguro Social' } },
          { pdf: 'Employees E-mail Address', type: 'email', label: { en: 'Email Address', es: 'Correo Electrónico' } },
          { pdf: 'Telephone Number', type: 'tel', label: { en: 'Telephone Number', es: 'Número de Teléfono' } },
        ],
      },
      {
        title: { en: 'Citizenship / Immigration Status', es: 'Estado de Ciudadanía / Inmigración' },
        fields: [
          {
            type: 'radio',
            label: { en: 'Check one:', es: 'Marque uno:' },
            options: [
              { value: 'cb1', pdf: 'CB_1', label: { en: 'A citizen of the United States', es: 'Ciudadano(a) de los Estados Unidos' } },
              { value: 'cb2', pdf: 'CB_2', label: { en: 'A noncitizen national of the United States', es: 'Nacional no ciudadano de los EE. UU.' } },
              { value: 'cb3', pdf: 'CB_3', label: { en: 'A lawful permanent resident', es: 'Residente permanente legal' } },
              { value: 'cb4', pdf: 'CB_4', label: { en: 'A noncitizen authorized to work', es: 'No ciudadano autorizado para trabajar' } },
            ],
          },
          { pdf: '3 A lawful permanent resident Enter USCIS or ANumber', type: 'text', label: { en: 'If permanent resident: USCIS/A-Number', es: 'Si es residente permanente: Número USCIS/A' } },
          { pdf: 'Exp Date mmddyyyy', type: 'text', label: { en: 'If authorized to work until: expiration (mm/dd/yyyy)', es: 'Si autorizado hasta: vencimiento (mm/dd/yyyy)' } },
        ],
      },
      {
        title: { en: 'Signature', es: 'Firma' },
        fields: [
          { pdf: 'Signature of Employee', type: 'text', label: { en: 'Signature (type your full name)', es: 'Firma (escriba su nombre completo)' } },
          { pdf: "Today's Date mmddyyy", type: 'text', label: { en: "Today's Date (mm/dd/yyyy)", es: 'Fecha de Hoy (mm/dd/yyyy)' } },
        ],
      },
    ],
  },

  {
    key: 'dd',
    files: { all: '/apply-forms/direct-deposit.pdf' },
    title: { en: 'Direct Deposit Authorization', es: 'Autorización de Depósito Directo' },
    note: {
      en: 'Optional. Provide bank details if you want your pay deposited automatically. You will still need to give your employer a voided check.',
      es: 'Opcional. Proporcione los datos bancarios si desea depósito automático. Aún deberá entregar un cheque anulado a su empleador.',
    },
    sections: [
      {
        title: { en: 'Account 1', es: 'Cuenta 1' },
        fields: [
          {
            type: 'radio',
            label: { en: 'Account type', es: 'Tipo de cuenta' },
            options: [
              { value: 'checking', pdf: { field: 'Group1', on: 'Choice1' }, label: { en: 'Checking', es: 'Cheques' } },
              { value: 'savings', pdf: { field: 'Group1', on: 'Choice2' }, label: { en: 'Savings', es: 'Ahorros' } },
            ],
          },
          { pdf: 'Bank routing number ABA number', type: 'text', label: { en: 'Bank routing number (ABA)', es: 'Número de ruta bancaria (ABA)' } },
          { pdf: 'Account number', type: 'text', label: { en: 'Account number', es: 'Número de cuenta' } },
          { pdf: 'Percentage or dollar amount to be deposited to this account', type: 'text', label: { en: 'Percentage or amount to deposit', es: 'Porcentaje o monto a depositar' } },
        ],
      },
      {
        title: { en: 'Authorization', es: 'Autorización' },
        fields: [
          { pdf: 'This authorizes', type: 'fixed', value: '3 Phase Conveyor', label: { en: 'Company', es: 'Compañía' } },
          { pdf: 'Print name', type: 'text', label: { en: 'Print name', es: 'Nombre en letra de molde' } },
          { pdf: 'Employee ID', type: 'text', label: { en: 'Employee ID # (if known)', es: 'ID de Empleado (si lo sabe)' } },
          { pdf: 'Date', type: 'text', label: { en: 'Date', es: 'Fecha' } },
        ],
      },
    ],
  },
];

export const HR_EMAIL = 'hr@3phase-conveyor.com'; // TODO: confirm the real HR address
