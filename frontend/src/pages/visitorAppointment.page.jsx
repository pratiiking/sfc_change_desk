import React, { useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, Plus } from 'lucide-react';
import { FormLabel } from '../components/ui/primitives.component';
import TimeWheelPicker from '../components/ui/TimeWheelPicker.component';

const ACTIVE_FIELD_CLASS = 'w-full box-border rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground';
const READONLY_FIELD_CLASS = 'w-full box-border cursor-not-allowed rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-muted-foreground opacity-80';
const ERROR_FIELD_CLASS = 'border-red-500 focus:border-red-500 focus:ring-red-500/20';

const todayInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolveUserLocation = (user) => user?.employee?.location || user?.location || '';
const resolveUserName = (user) => user?.employee?.name || user?.name || user?.displayName || '';
const isGlobalLocation = (location) => String(location || '').trim().toLowerCase() === 'global';

export default function VisitorAppointmentPage({ user, onNavigate }) {
  const sessionUser = useMemo(() => {
    if (user) return user;
    try {
      return JSON.parse(localStorage.getItem('sfc_user') || '{}');
    } catch {
      return {};
    }
  }, [user]);

  const loginLocation = resolveUserLocation(sessionUser);
  const lockedWhomToMeet = resolveUserName(sessionUser);
  const shouldSelectLocation = isGlobalLocation(loginLocation);

  const [form, setForm] = useState({
    location: shouldSelectLocation ? '' : loginLocation,
    expectedDate: todayInputValue(),
    expectedTime: '',
    visitorName: '',
    phone: '',
    email: '',
    company: '',
    purpose: ''
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined, general: undefined }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.location) nextErrors.location = shouldSelectLocation ? 'Select a location' : 'Location is not available in your login details.';
    if (!lockedWhomToMeet) nextErrors.general = 'Whom to meet is not available in your login details.';
    if (!form.expectedDate) nextErrors.expectedDate = 'Expected date is required';
    if (!form.visitorName.trim()) nextErrors.visitorName = 'Visitor name is required';
    if (!/^\d{10}$/.test(form.phone.trim())) nextErrors.phone = 'Enter a valid 10-digit mobile number';
    if (!form.purpose.trim()) nextErrors.purpose = 'Purpose is required';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }
    return nextErrors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-132px)] max-w-[720px] items-center justify-center">
        <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#059669]">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="m-0 text-xl font-bold text-[#065F46]">Visitor Appointment Created</h1>
          <p className="m-0 max-w-[480px] text-[0.85rem] leading-normal text-[#047857]">
            Appointment for <strong>{form.visitorName}</strong> has been captured for <strong>{lockedWhomToMeet}</strong>.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
            onClick={() => {
              setSubmitted(false);
              setForm({
                  location: shouldSelectLocation ? '' : loginLocation,
                  expectedDate: todayInputValue(),
                  expectedTime: '',
                  visitorName: '',
                  phone: '',
                  email: '',
                  company: '',
                  purpose: ''
                });
                setErrors({});
              }}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border-none bg-[#047857] px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              <Plus size={14} />
              New Appointment
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('Dashboard')}
              className="cursor-pointer rounded-lg border border-[#A7F3D0] bg-transparent px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-[#065F46]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <div>
        <h1 className="m-0 text-[1.45rem] font-bold leading-[1.2] text-foreground">
          Visitor Appointment
        </h1>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Pre-register a visitor expected to arrive.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarPlus size={21} className="text-foreground" />
              <h1 className="m-0 text-[1.2rem] font-bold leading-tight text-foreground">New Appointment</h1>
            </div>
            <p className="m-0 mt-1 text-sm text-muted-foreground">Pre-register a visitor expected to arrive.</p>
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          <div>
            <FormLabel required>Location</FormLabel>
            {shouldSelectLocation ? (
              <select
                value={form.location}
                onChange={(event) => updateField('location', event.target.value)}
                className={`${ACTIVE_FIELD_CLASS} ${errors.location ? ERROR_FIELD_CLASS : ''}`}
              >
                <option value="">Select location</option>
                <option value="Pune">Pune</option>
                <option value="Bengaluru">Bengaluru</option>
              </select>
            ) : (
              <input type="text" readOnly disabled value={form.location} placeholder="Location from login" className={READONLY_FIELD_CLASS} />
            )}
          </div>

          <div>
            <FormLabel required>Whom to Meet</FormLabel>
            <input type="text" readOnly disabled value={lockedWhomToMeet} placeholder="Name from login" className={READONLY_FIELD_CLASS} />
          </div>

          <div>
            <FormLabel required>Visitor Name</FormLabel>
            <input
              type="text"
              value={form.visitorName}
              onChange={(event) => updateField('visitorName', event.target.value)}
              placeholder="Enter visitor name"
              className={`${ACTIVE_FIELD_CLASS} ${errors.visitorName ? ERROR_FIELD_CLASS : ''}`}
            />
          </div>

          <div>
            <FormLabel required>Phone Number</FormLabel>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
              className={`${ACTIVE_FIELD_CLASS} ${errors.phone ? ERROR_FIELD_CLASS : ''}`}
            />
          </div>

          <div>
            <FormLabel>Email</FormLabel>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="Enter email"
              className={`${ACTIVE_FIELD_CLASS} ${errors.email ? ERROR_FIELD_CLASS : ''}`}
            />
          </div>

          <div>
            <FormLabel>Company</FormLabel>
            <input
              type="text"
              value={form.company}
              onChange={(event) => updateField('company', event.target.value)}
              placeholder="Enter company name"
              className={ACTIVE_FIELD_CLASS}
            />
          </div>

          <div>
            <FormLabel required>Expected Date</FormLabel>
            <input
              type="date"
              value={form.expectedDate}
              min={todayInputValue()}
              onChange={(event) => updateField('expectedDate', event.target.value)}
              className={`${ACTIVE_FIELD_CLASS} ${errors.expectedDate ? ERROR_FIELD_CLASS : ''}`}
            />
          </div>

          <div>
            <TimeWheelPicker
              label="Expected Time"
              value={form.expectedTime}
              onChange={(value) => updateField('expectedTime', value)}
            />
          </div>

          <div className="md:col-span-2">
            <FormLabel required>Purpose of Visit</FormLabel>
            <input
              type="text"
              value={form.purpose}
              onChange={(event) => updateField('purpose', event.target.value)}
              placeholder="Enter purpose of visit"
              className={`${ACTIVE_FIELD_CLASS} ${errors.purpose ? ERROR_FIELD_CLASS : ''}`}
            />
          </div>
        </div>

        <p className="m-0 mt-4 max-w-[620px] text-[0.8rem] leading-snug text-muted-foreground">
          Please request the visitor to arrive 10 minutes before the appointment time and carry valid identity proof. Visitors may also be asked to declare any assets they bring onto the premises.
        </p>

        {(errors.general || Object.values(errors).some(Boolean)) && (
          <p className="m-0 mt-4 text-[0.8rem] font-medium text-red-600">
            {errors.general || 'Please correct the highlighted fields.'}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('Dashboard')}
            className="cursor-pointer rounded-lg border border-border bg-card px-[1.1rem] py-[0.65rem] text-[0.85rem] font-semibold text-foreground shadow-[0_1px_3px_rgba(16,21,30,0.08)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border-none bg-primary px-[1.1rem] py-[0.65rem] text-[0.85rem] font-semibold text-primary-foreground shadow-[0_1px_3px_rgba(16,21,30,0.12)]"
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
