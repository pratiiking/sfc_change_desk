import React, { useId, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plane,
  Car,
  Bus,
  Train,
  Building2,
  ArrowLeft,
  ArrowRight,
  Send,
  CheckCircle2,
  Luggage,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar,
  Clock,
  MapPin
} from 'lucide-react';
import { TRAVEL_MODES, TRAVEL_DESK_FIELDS } from '../lib/travelDesk.config.js';
import { FormLabel } from '../components/ui/primitives.component';
import FormStepper from '../components/ui/FormStepper.component';
import ManagerCombobox from '../components/ui/ManagerCombobox.component';
import { apiFetch } from '../lib/apiFetch.lib';

const ICON_MAP = {
  Flight: Plane,
  Cab: Car,
  Bus: Bus,
  Train: Train,
  Hotel: Building2
};

const ACTIVE_FIELD_BASE_CLASS = 'w-full box-border rounded-lg border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none';

const READONLY_FIELD_CLASS = 'w-full box-border cursor-not-allowed rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-muted-foreground';

const PREFERRED_TIME_OPTIONS = [
  { value: '', label: 'Select time' },
  { value: 'Early morning (05:00–08:00)', label: 'Early morning (05:00–08:00)' },
  { value: 'Morning (08:00–12:00)', label: 'Morning (08:00–12:00)' },
  { value: 'Afternoon (12:00–17:00)', label: 'Afternoon (12:00–17:00)' },
  { value: 'Evening (17:00–21:00)', label: 'Evening (17:00–21:00)' },
  { value: 'Night (after 21:00)', label: 'Night (after 21:00)' },
  { value: 'Flexible', label: 'Flexible' }
];

const resolveEmpBusinessId = (u, initialVal) => {
  if (initialVal && typeof initialVal === 'string' && !initialVal.startsWith('S8-') && !initialVal.startsWith('EMP-')) return initialVal;
  if (u?.employee?.empId) return u.employee.empId;
  if (u?.employee?.employeeBusinessId) return u.employee.employeeBusinessId;
  if (u?.employeeBusinessId) return u.employeeBusinessId;
  if (u?.employeeId && typeof u.employeeId === 'string' && !u.employeeId.startsWith('S8-') && !u.employeeId.startsWith('EMP-')) return u.employeeId;
  if (u?.empId && typeof u.empId === 'string' && !u.empId.startsWith('S8-') && !u.empId.startsWith('EMP-')) return u.empId;
  return '';
};

const resolveEmpLocation = (u, initialVal) => {
  if (initialVal && typeof initialVal === 'string' && !initialVal.includes('Auto-fetched') && !initialVal.includes('Not specified')) return initialVal;
  if (u?.employee?.location) return u.employee.location;
  if (u?.location) return u.location;
  return '';
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return dateStr;
};

// Builds a clean route string across legs e.g. "Mumbai → Delhi → Bengaluru" or disconnected legs "Mumbai → Delhi | Goa → Bengaluru"
const buildJourneySummary = (legs) => {
  if (!Array.isArray(legs) || legs.length === 0) return '';
  const validLegs = legs.filter(l => (l.from && l.from.trim()) || (l.to && l.to.trim()));
  if (validLegs.length === 0) return '';

  const segments = [];
  let currentChain = [];

  validLegs.forEach((leg, idx) => {
    const from = (leg.from || '').trim();
    const to = (leg.to || '').trim();

    if (idx === 0) {
      if (from) currentChain.push(from);
      if (to) currentChain.push(to);
    } else {
      const prevTo = (validLegs[idx - 1].to || '').trim();
      if (from && prevTo && from.toLowerCase() === prevTo.toLowerCase()) {
        if (to) currentChain.push(to);
      } else {
        if (currentChain.length > 0) {
          segments.push(currentChain.join(' → '));
        }
        currentChain = [];
        if (from) currentChain.push(from);
        if (to) currentChain.push(to);
      }
    }
  });

  if (currentChain.length > 0) {
    segments.push(currentChain.join(' → '));
  }

  return segments.join(' | ');
};

export default function TravelDeskPage({ onNavigate, user, travellerName = '', department = '' }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [category, setCategory] = useState('');
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [step, setStepState] = useState(1);
  const [drafts, setDrafts] = useState({});
  const [certified, setCertified] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [stepErrors, setStepErrors] = useState({});

  // Multi-city state
  const [multiCityLegs, setMultiCityLegs] = useState([
    { id: 'leg-1', travelDate: '', preferredTime: '', from: '', to: '' }
  ]);

  // Synchronize internal steps with browser history for touchpad / back gesture support
  const setStep = (nextStep, replace = false) => {
    setStepState(nextStep);
    if (typeof window !== 'undefined') {
      const stateObj = { travelStep: nextStep, travelCategory: category };
      if (replace) {
        window.history.replaceState(stateObj, '');
      } else {
        window.history.pushState(stateObj, '');
      }
    }
  };

  useEffect(() => {
    // Initialize history state on mount
    if (typeof window !== 'undefined') {
      window.history.replaceState({ travelStep: 1, travelCategory: '' }, '');
    }

    const handlePopState = (event) => {
      if (event.state && typeof event.state.travelStep === 'number') {
        setStepState(event.state.travelStep);
        if (event.state.travelCategory !== undefined) {
          setCategory(event.state.travelCategory);
        }
      } else {
        setStepState(1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [currentSessionUser, setCurrentSessionUser] = useState(() => user || JSON.parse(localStorage.getItem('sfc_user') || '{}'));
  const activeSessionUser = currentSessionUser || user || JSON.parse(localStorage.getItem('sfc_user') || '{}');

  const [requesterDetails, setRequesterDetails] = useState(() => ({
    employeeName: travellerName || activeSessionUser?.employee?.name || activeSessionUser?.name || '',
    employeeEmail: activeSessionUser?.employee?.email || activeSessionUser?.email || '',
    employeeId: resolveEmpBusinessId(activeSessionUser),
    location: resolveEmpLocation(activeSessionUser) || '',
    managerName: '',
    managerEmail: ''
  }));

  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await apiFetch('/users');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data)) {
            const list = data.data.map(u => ({
              id: u.id,
              name: u.name || u.employee?.name || (u.email ? u.email.split('@')[0] : 'User'),
              email: u.email || u.employee?.email || '',
              department: u.department || u.employee?.department || '',
              location: u.location || u.employee?.location || ''
            })).filter(u => u.name && u.email);
            setAvailableUsers(list);
          }
        }
      } catch (err) {
        console.warn('Failed to load active employees for manager dropdown:', err);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const currentUser = user || JSON.parse(localStorage.getItem('sfc_user') || '{}');
    if (currentUser) {
      setCurrentSessionUser(currentUser);
      setRequesterDetails(prev => ({
        ...prev,
        employeeName: prev.employeeName || currentUser.employee?.name || currentUser.name || '',
        employeeEmail: prev.employeeEmail || currentUser.employee?.email || currentUser.email || '',
        employeeId: resolveEmpBusinessId(currentUser, prev.employeeId),
        location: resolveEmpLocation(currentUser, prev.location)
      }));
    }
  }, [user]);

  const values = drafts[category] || {};
  const effectiveTraveller = travellerName || user?.name || '';
  const valueOf = field => values[field.name] ?? (field.name === 'Traveller' ? effectiveTraveller : field.default);

  const update = (field, value) => {
    setDrafts(previous => ({
      ...previous,
      [category]: { ...previous[category], [field.name]: value }
    }));
    setCertified(false);
    setMessage('');
    setStepErrors(prev => ({ ...prev, [field.name]: undefined, general: undefined }));
  };

  const isFlight = category?.toLowerCase() === 'flight' || category?.toLowerCase() === 'flights';
  const isCab = category?.toLowerCase() === 'cab' || category?.toLowerCase() === 'cabs';
  const isMultiCityFlight = isFlight && values['Trip type'] === 'Multi-city / Onward';

  const multiCityExcludedFieldNames = new Set([
    'Date of travel',
    'Preferred departure time',
    'From',
    'To',
    'Return / onward date',
    'Return / onward time',
    'Onward destination'
  ]);

  const visibleFields = (TRAVEL_DESK_FIELDS[category] || []).filter(field => {
    if (isMultiCityFlight && multiCityExcludedFieldNames.has(field.name)) {
      return false;
    }
    if (field.conditional) {
      const expectedVal = field.conditionalValue || 'Yes';
      if (values[field.conditional] !== expectedVal) return false;
    }
    if (field.group && (values['Trip type'] || 'Return') === 'One-way') {
      return false;
    }
    return true;
  });

  const todayStr = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  // Multi-city Leg Handlers
  const handleAddLeg = () => {
    const prevLeg = multiCityLegs[multiCityLegs.length - 1];
    const defaultFrom = prevLeg ? (prevLeg.to || '') : '';
    const newLeg = {
      id: `leg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      travelDate: '',
      preferredTime: '',
      from: defaultFrom,
      to: ''
    };
    setMultiCityLegs(prev => [...prev, newLeg]);
    setStepErrors({});
    setMessage('');
  };

  const handleRemoveLeg = (idToRemove) => {
    if (multiCityLegs.length <= 1) return;
    setMultiCityLegs(prev => prev.filter(leg => leg.id !== idToRemove));
    setStepErrors({});
    setMessage('');
  };

  const handleUpdateLeg = (id, key, val) => {
    setMultiCityLegs(prev => prev.map(leg => {
      if (leg.id === id) {
        return { ...leg, [key]: val };
      }
      return leg;
    }));
    setStepErrors({});
    setMessage('');
    setCertified(false);
  };

  const validateMultiCityForm = () => {
    const errors = {};
    let firstLegDate = '';
    let lastLegDate = '';

    multiCityLegs.forEach((leg, index) => {
      const legNum = index + 1;
      const legErrors = {};

      if (!leg.travelDate) {
        legErrors.travelDate = 'Travel date is required';
      }
      if (!leg.preferredTime) {
        legErrors.preferredTime = 'Preferred time slot is required';
      }
      if (!leg.from || !leg.from.trim()) {
        legErrors.from = 'From location is required';
      }
      if (!leg.to || !leg.to.trim()) {
        legErrors.to = 'To location is required';
      }

      if (leg.from && leg.to && leg.from.trim().toLowerCase() === leg.to.trim().toLowerCase()) {
        legErrors.to = 'Departure and arrival destinations cannot be identical';
      }

      if (leg.travelDate) {
        if (index === 0) {
          firstLegDate = leg.travelDate;
        } else {
          const prevLeg = multiCityLegs[index - 1];
          if (prevLeg.travelDate && leg.travelDate < prevLeg.travelDate) {
            legErrors.travelDate = `Flight ${legNum} date cannot be earlier than Flight ${index} date (${formatDateDisplay(prevLeg.travelDate)})`;
          }
        }
        lastLegDate = leg.travelDate;
      }

      if (Object.keys(legErrors).length > 0) {
        errors[leg.id] = legErrors;
      }
    });

    return { isValid: Object.keys(errors).length === 0, errors };
  };

  const handleProceedToReview = (e) => {
    e.preventDefault();
    if (!requesterDetails.managerName || !requesterDetails.managerEmail) {
      setMessage('Please select a reporting manager from the list.');
      return;
    }

    if (isMultiCityFlight) {
      const { isValid, errors } = validateMultiCityForm();
      if (!isValid) {
        setStepErrors(errors);
        setMessage('Please correct the highlighted errors in your multi-city flight itinerary.');
        return;
      }
    }

    setStepErrors({});
    setMessage('');
    setStep(3);
  };

  const checkBoardApprovalRequired = () => {
    // 1. Flight Board Approval Rules: Premium Economy / Business OR < 7 days notice
    if (isFlight) {
      const travelClass = String(values['Travel class'] || 'Economy').toLowerCase();
      if (travelClass.includes('premium') || travelClass.includes('business')) {
        return {
          required: true,
          reason: `${values['Travel class'] || 'Premium/Business'} class flight booking selected. The request will be routed for additional Board approval.`
        };
      }

      const travelDateStr = isMultiCityFlight
        ? (multiCityLegs[0]?.travelDate || '')
        : (values['Date of travel'] || values['Date of journey'] || values['Check-in date']);

      if (!travelDateStr) return { required: false, reason: '' };

      const parts = travelDateStr.split('-');
      if (parts.length !== 3) return { required: false, reason: '' };
      const travelDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (isNaN(travelDate.getTime())) return { required: false, reason: '' };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      travelDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((travelDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        return {
          required: true,
          reason: 'This travel date is less than 7 days from today. The request will be routed for additional Board approval.'
        };
      }
    }

    // 2. Cab Board Approval Rules
    if (isCab) {
      const passengers = parseInt(values['Number of passengers'] || '1', 10) || 1;
      const cabTypeStr = String(values['Cab type'] || 'Hatchback').toLowerCase();

      // Rule 2: Premium (Innova, etc.) always requires board approval
      if (cabTypeStr.includes('premium') || cabTypeStr.includes('innova')) {
        return {
          required: true,
          reason: 'Premium cab booking selected. The request will be routed for additional Board approval.'
        };
      }

      // Rule 1: SUV with < 3 passengers requires board approval
      if (cabTypeStr.includes('suv') || cabTypeStr.includes('ertiga')) {
        if (passengers < 3) {
          return {
            required: true,
            reason: `SUV requested for ${passengers} passenger${passengers > 1 ? 's' : ''} (less than 3 passengers). The request will be routed for additional Board approval.`
          };
        }
      }

      // Rule 3: Sedan with < 2 passengers (single passenger) requires board approval
      if (cabTypeStr.includes('sedan') || cabTypeStr.includes('dzire') || cabTypeStr.includes('aura')) {
        if (passengers < 2) {
          return {
            required: true,
            reason: 'Sedan requested for a single passenger. The request will be routed for additional Board approval.'
          };
        }
      }
    }

    return { required: false, reason: '' };
  };

  const boardApprovalInfo = checkBoardApprovalRequired();
  const isShortNotice = boardApprovalInfo.required;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!certified) {
      setMessage('Please confirm compliance with company travel policies.');
      return;
    }
    setIsSubmitting(true);
    setMessage('');
    try {
      const departureDate = isMultiCityFlight
        ? (multiCityLegs[0]?.travelDate || '')
        : (values['Date of travel'] || values['Date of journey'] || values['Check-in date'] || '');

      const returnDate = isMultiCityFlight
        ? null
        : (values['Return / onward date'] || values['Return date'] || values['Check-out date'] || null);

      const fromLocation = isMultiCityFlight
        ? (multiCityLegs[0]?.from || '')
        : (valueOf({ name: 'From' }) || valueOf({ name: 'From station' }) || valueOf({ name: 'Pickup location' }) || '');

      const toLocation = isMultiCityFlight
        ? (multiCityLegs[multiCityLegs.length - 1]?.to || '')
        : (valueOf({ name: 'To' }) || valueOf({ name: 'To station' }) || valueOf({ name: 'Final drop location' }) || valueOf({ name: 'City / Location' }) || '');

      const preferredTimeSlot = isMultiCityFlight
        ? (multiCityLegs[0]?.preferredTime || '')
        : (values['Preferred departure time'] || values['Preferred time slot'] || values['Pickup time'] || '');

      // Build consolidated bookingDetails, stripping out the raw keys that are
      // already captured in the canonical columns above (tripType, travelClass,
      // fromLocation, toLocation, departureDate, returnDate, preferredTimeSlot) so
      // the same value isn't persisted twice under its mode-specific label.
      const finalBookingDetails = {
        ...values
      };
      [
        'Traveller', 'Purpose of visit',
        'Trip type', 'Journey type',
        'Travel class', 'Bus type', 'Room type',
        'From', 'From station', 'Pickup location',
        'To', 'To station', 'Final drop location', 'City / Location',
        'Date of travel', 'Date of journey', 'Check-in date',
        'Return / onward date', 'Return date', 'Check-out date',
        'Preferred departure time', 'Preferred time slot', 'Pickup time'
      ].forEach((key) => delete finalBookingDetails[key]);

      if (isMultiCityFlight) {
        finalBookingDetails.legs = multiCityLegs;
        delete finalBookingDetails.returnFlightRequired;
        delete finalBookingDetails.returnLeg;
        delete finalBookingDetails.returnDate;
        delete finalBookingDetails.returnPreferredTime;
        delete finalBookingDetails.returnFrom;
        delete finalBookingDetails.returnTo;
        delete finalBookingDetails['Return / onward time'];
        delete finalBookingDetails['Onward destination'];
      }

      const payload = {
        category,
        travelMode: category,
        travellerName: requesterDetails.employeeName || valueOf({ name: 'Traveller' }),
        employeeEmail: requesterDetails.employeeEmail || '',
        employeeId: requesterDetails.employeeId || '',
        location: requesterDetails.location || '',
        managerName: requesterDetails.managerName || '',
        managerEmail: requesterDetails.managerEmail || '',
        department: department || user?.department || '',
        purpose: valueOf({ name: 'Purpose of visit' }),
        tripType: valueOf({ name: 'Trip type' }) || valueOf({ name: 'Journey type' }) || '',
        travelClass: valueOf({ name: 'Travel class' }) || valueOf({ name: 'Bus type' }) || valueOf({ name: 'Room type' }) || '',
        fromLocation,
        toLocation,
        departureDate,
        returnDate,
        preferredTimeSlot,
        isShortNotice,
        bookingDetails: finalBookingDetails,
        certified
      };

      const res = await apiFetch('/travel-desk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit travel request');
      }
      setCreatedCode(data.data?.requestCode || '');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary-cards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expanded'] });
      queryClient.invalidateQueries({ queryKey: ['worklist'] });
      setSubmitted(true);
    } catch (err) {
      setMessage(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = ['Travel Mode', 'Travel Details', 'Review & Submit'];
  const journeySummary = isMultiCityFlight ? buildJourneySummary(multiCityLegs) : '';

  return (
    <div className="flex w-full flex-col gap-5 pb-12">

      {/* Top Header */}
      <div>
        <h1 className="m-0 text-[1.45rem] font-bold leading-[1.2] text-foreground">
          Travel &amp; Stay Desk
        </h1>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Book corporate flights, trains, cabs, buses, and hotel accommodations
        </p>
      </div>

      {/* Stepper */}
      <FormStepper steps={stepsList} currentStep={step} />

      {/* Success Banner */}
      {submitted && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#059669]">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="m-0 text-xl font-bold text-[#065F46]">
            Travel Request Submitted Successfully
          </h3>
          <p className="m-0 max-w-[480px] text-[0.85rem] leading-normal text-[#047857]">
            Your <strong>{category}</strong> reservation request <strong>{createdCode || ''}</strong> for <strong>{valueOf({ name: 'Traveller' })}</strong> has been submitted and sent for approval.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setCreatedCode('');
                setStep(1);
                setCategory('');
                setDrafts({});
                setCertified(false);
                setMessage('');
                setStepErrors({});
                setMultiCityLegs([{ id: 'leg-1', travelDate: '', preferredTime: '', from: '', to: '' }]);
                const curr = activeSessionUser;
                setRequesterDetails({
                  employeeName: travellerName || curr?.employee?.name || curr?.name || '',
                  employeeEmail: curr?.employee?.email || curr?.email || '',
                  employeeId: resolveEmpBusinessId(curr, ''),
                  location: resolveEmpLocation(curr, '') || '',
                  managerName: '',
                  managerEmail: ''
                });
              }}
              className="cursor-pointer rounded-lg border-none bg-[#047857] px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              Book Another Trip
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
      )}

      {/* STEP 1: Select Travel Category */}
      {!submitted && step === 1 && (
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-foreground">
                1. Select Booking Type
              </h3>
              <span className="text-[0.775rem] font-semibold text-muted-foreground">
                Step 1 of 3
              </span>
            </div>

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
              {TRAVEL_MODES.map(mode => {
                const IconComponent = ICON_MAP[mode.id] || Luggage;
                const selected = category === mode.id;
                const isHovered = hoveredCategory === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setCategory(mode.id)}
                    onMouseEnter={() => setHoveredCategory(mode.id)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    className={`flex min-h-[92px] cursor-pointer items-center gap-4 rounded-xl p-[1.1rem] text-left transition-[transform,border-color,box-shadow,background-color] duration-200 ${
                      isHovered ? '-translate-y-[5px]' : 'translate-y-0'
                    } ${
                      selected
                        ? 'border-2 border-primary bg-input shadow-[0_0_0_3px_rgba(23,60,78,0.12)]'
                        : isHovered
                        ? 'border-[1.5px] border-primary bg-card shadow-[0_12px_24px_-4px_rgba(23,60,78,0.14),0_4px_12px_-2px_rgba(0,0,0,0.06)]'
                        : 'border border-border bg-card shadow-[0_1px_3px_rgba(16,21,30,0.04)]'
                    }`}
                  >
                    <div
                      className={`flex shrink-0 items-center justify-center rounded-[10px] p-[0.65rem] transition-[transform,background-color,color] duration-200 ${
                        isHovered ? 'scale-[1.08]' : 'scale-100'
                      } ${
                        selected
                          ? 'bg-primary text-white'
                          : isHovered
                          ? 'bg-primary/8 text-info'
                          : 'bg-input text-info'
                      }`}
                    >
                      <IconComponent size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{mode.label}</div>
                      <div className="mt-1 text-[0.775rem] leading-[1.4] text-muted-foreground">{mode.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="button"
              disabled={!category}
              onClick={() => setStep(2)}
              className={`inline-flex items-center gap-[0.45rem] rounded-lg border-none bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white ${
                !category ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <span>Next: Travel Details</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Travel Details Form */}
      {!submitted && step === 2 && (
        <form onSubmit={handleProceedToReview} className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          {/* Section 1: Requester Details */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-foreground">
                Requester Details
              </h3>
              <span className="text-[0.775rem] font-semibold text-muted-foreground">
                Section 1 of 2
              </span>
            </div>

            <div className="cd-responsive-form-grid">
              <div>
                <FormLabel>Requester Name</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={requesterDetails.employeeName}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
              <div>
                <FormLabel>Employee Email</FormLabel>
                <input
                  type="email"
                  readOnly
                  disabled
                  placeholder="e.g. employee@company.com"
                  value={requesterDetails.employeeEmail}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
              <div>
                <FormLabel>Employee ID</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  placeholder="e.g. SFC-0083"
                  value={requesterDetails.employeeId}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
              <div>
                <FormLabel>Location</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  placeholder="Enter Location"
                  value={requesterDetails.location || resolveEmpLocation(activeSessionUser) || ''}
                  className={READONLY_FIELD_CLASS}
                />
              </div>

              {/* Searchable Manager Combobox Dropdown */}
              <ManagerCombobox
                managerName={requesterDetails.managerName}
                managerEmail={requesterDetails.managerEmail}
                onSelect={(u) => setRequesterDetails(prev => ({ ...prev, managerName: u.name, managerEmail: u.email }))}
                users={availableUsers}
                loading={loadingUsers}
              />

              <div>
                <FormLabel>Manager Email</FormLabel>
                <input
                  type="email"
                  readOnly
                  disabled
                  placeholder="Selected manager's email"
                  value={requesterDetails.managerEmail}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Section 2: Reservation Details */}
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-semibold text-foreground">
              {category} Reservation Details
            </h3>
            <span className="text-[0.775rem] font-semibold text-muted-foreground">
              Section 2 of 2
            </span>
          </div>

          <div className="cd-responsive-form-grid">
            {visibleFields.map(field => {
              const fieldId = `${uid}-${category}-${field.name}`;
              let minVal = field.min;
              if (field.type === 'date') {
                if (field.name === 'Return / onward date' || field.name === 'Return date' || field.name === 'Check-out date') {
                  minVal = values['Date of travel'] || values['Date of journey'] || values['Check-in date'] || todayStr;
                } else {
                  minVal = field.min || todayStr;
                }
              }

              return (
                <div key={field.name} className={field.full ? 'col-span-full' : undefined}>
                  <FormLabel required={field.required} htmlFor={fieldId}>
                    {field.label}
                  </FormLabel>

                  {field.type === 'select' ? (
                    <select
                      id={fieldId}
                      required={field.required}
                      value={valueOf(field)}
                      onChange={e => update(field, e.target.value)}
                      className={`${ACTIVE_FIELD_BASE_CLASS} border-border`}
                    >
                      {(field.options || []).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={fieldId}
                      rows={3}
                      required={field.required}
                      value={valueOf(field)}
                      onChange={e => update(field, e.target.value)}
                      placeholder={field.placeholder}
                      className={`${ACTIVE_FIELD_BASE_CLASS} border-border resize-y`}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      type={field.type === 'input' ? 'text' : field.type}
                      min={minVal}
                      required={field.required}
                      value={valueOf(field)}
                      onChange={e => update(field, e.target.value)}
                      placeholder={field.placeholder}
                      className={`${ACTIVE_FIELD_BASE_CLASS} border-border`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* MULTI-CITY FLIGHT SECTION (Stacked Flight Cards & Journey Summary) */}
          {isMultiCityFlight && (
            <div className="mt-1 flex flex-col gap-5">

              {/* 1. Journey Summary Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-input px-5 py-[0.85rem]">
                <div className="flex items-center gap-[0.65rem]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-info">
                    <Plane size={17} />
                  </div>
                  <div>
                    <div className="text-[0.725rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Multi-City Journey Route
                    </div>
                    <div className="mt-[0.1rem] text-[0.95rem] font-bold text-foreground">
                      {journeySummary || 'Enter your flight origins and destinations below'}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-white px-[0.65rem] py-1 text-xs font-semibold text-primary">
                  {multiCityLegs.length} {multiCityLegs.length === 1 ? 'Flight Leg' : 'Flight Legs'}
                </div>
              </div>

              {/* 2. Stacked Flight Cards */}
              <div className="flex flex-col gap-4">
                {multiCityLegs.map((leg, index) => {
                  const legNum = index + 1;
                  const prevLeg = index > 0 ? multiCityLegs[index - 1] : null;
                  const minDateForLeg = (prevLeg && prevLeg.travelDate) ? prevLeg.travelDate : todayStr;
                  const legError = stepErrors[leg.id] || {};

                  return (
                    <div
                      key={leg.id}
                      className="relative flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-5 shadow-[0_1px_2px_rgba(16,21,30,0.03)]"
                    >
                      {/* Card Top Bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-[0.6rem]">
                          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                            {legNum}
                          </span>
                          <h4 className="m-0 text-[0.95rem] font-bold text-foreground">
                            Flight {legNum}
                          </h4>
                        </div>

                        {multiCityLegs.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove Flight ${legNum}`}
                            onClick={() => handleRemoveLeg(leg.id)}
                            className="inline-flex cursor-pointer items-center gap-[0.35rem] rounded-md border border-[#FECACA] bg-[#FEF2F2] px-[0.65rem] py-[0.35rem] text-[0.775rem] font-semibold text-[#DC2626]"
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      {/* 2-Column Desktop / 1-Column Mobile Layout */}
                      <div className="cd-responsive-form-grid" style={{ gap: '0.85rem' }}>

                        {/* Travel Date */}
                        <div>
                          <FormLabel required htmlFor={`leg-date-${leg.id}`}>Travel date</FormLabel>
                          <input
                            id={`leg-date-${leg.id}`}
                            type="date"
                            min={minDateForLeg}
                            required
                            value={leg.travelDate}
                            onChange={(e) => handleUpdateLeg(leg.id, 'travelDate', e.target.value)}
                            className={`${ACTIVE_FIELD_BASE_CLASS} ${legError.travelDate ? 'border-[#DC2626]' : 'border-border'}`}
                          />
                          {legError.travelDate && (
                            <div className="mt-1 text-[0.725rem] font-medium text-[#DC2626]">
                              {legError.travelDate}
                            </div>
                          )}
                        </div>

                        {/* Preferred Time Slot */}
                        <div>
                          <FormLabel required htmlFor={`leg-time-${leg.id}`}>Preferred time slot</FormLabel>
                          <select
                            id={`leg-time-${leg.id}`}
                            required
                            value={leg.preferredTime}
                            onChange={(e) => handleUpdateLeg(leg.id, 'preferredTime', e.target.value)}
                            className={`${ACTIVE_FIELD_BASE_CLASS} ${legError.preferredTime ? 'border-[#DC2626]' : 'border-border'}`}
                          >
                            {PREFERRED_TIME_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {legError.preferredTime && (
                            <div className="mt-1 text-[0.725rem] font-medium text-[#DC2626]">
                              {legError.preferredTime}
                            </div>
                          )}
                        </div>

                        {/* From */}
                        <div>
                          <FormLabel required htmlFor={`leg-from-${leg.id}`}>From</FormLabel>
                          <input
                            id={`leg-from-${leg.id}`}
                            type="text"
                            required
                            placeholder="City or airport"
                            value={leg.from}
                            onChange={(e) => handleUpdateLeg(leg.id, 'from', e.target.value)}
                            className={`${ACTIVE_FIELD_BASE_CLASS} ${legError.from ? 'border-[#DC2626]' : 'border-border'}`}
                          />
                          {legError.from && (
                            <div className="mt-1 text-[0.725rem] font-medium text-[#DC2626]">
                              {legError.from}
                            </div>
                          )}
                        </div>

                        {/* To */}
                        <div>
                          <FormLabel required htmlFor={`leg-to-${leg.id}`}>To</FormLabel>
                          <input
                            id={`leg-to-${leg.id}`}
                            type="text"
                            required
                            placeholder="City or airport"
                            value={leg.to}
                            onChange={(e) => handleUpdateLeg(leg.id, 'to', e.target.value)}
                            className={`${ACTIVE_FIELD_BASE_CLASS} ${legError.to ? 'border-[#DC2626]' : 'border-border'}`}
                          />
                          {legError.to && (
                            <div className="mt-1 text-[0.725rem] font-medium text-[#DC2626]">
                              {legError.to}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 3. "+ Add destination" Button */}
              <div>
                <button
                  type="button"
                  onClick={handleAddLeg}
                  className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border-[1.5px] border-dashed border-info bg-card px-[1.1rem] py-[0.6rem] text-[0.85rem] font-semibold text-info transition-colors duration-150"
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--info) 10%, transparent)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--card-bg)'}
                >
                  <Plus size={16} />
                  <span>Add destination</span>
                </button>
              </div>

            </div>
          )}

          {isShortNotice && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[10px] border border-[#FDE047] border-l-[5px] border-l-[#CA8A04] bg-[#FEFCE8] px-5 py-4"
            >
              <div className="mt-[2px] shrink-0 text-[#854D0E]">
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="text-[0.85rem] font-bold leading-[1.3] text-[#854D0E]">
                  Board approval will be required
                </div>
                <p className="m-0 mt-[0.2rem] text-[0.8rem] leading-[1.45] text-[#713F12]">
                  {boardApprovalInfo.reason || 'This booking requires additional Board member sign-off per corporate travel policy.'}
                </p>
              </div>
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[0.825rem] font-semibold text-[#DC2626]">
              {message}
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border border-border bg-card px-4 py-[0.55rem] text-[0.825rem] font-semibold text-foreground"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border-none bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              <span>Next: Review &amp; Submit</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Review & Submit */}
      {!submitted && step === 3 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          {/* Header Row with Edit details Action */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-semibold text-foreground">
                Review &amp; Submit
              </h2>
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                Confirm the details before submitting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-sm font-semibold text-info"
            >
              Edit details
            </button>
          </div>

          {isShortNotice && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[10px] border border-[#FDE047] border-l-[5px] border-l-[#CA8A04] bg-[#FEFCE8] px-5 py-4"
            >
              <div className="mt-[2px] shrink-0 text-base text-[#854D0E]">
                ⚠️
              </div>
              <div>
                <div className="text-[0.85rem] font-bold leading-[1.3] text-[#854D0E]">
                  Board approval will be required
                </div>
                <p className="m-0 mt-[0.2rem] text-[0.8rem] leading-[1.45] text-[#713F12]">
                  {boardApprovalInfo.reason || 'This booking requires additional Board member sign-off per corporate travel policy.'}
                </p>
              </div>
            </div>
          )}

          {/* Travel Request Summary Card */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-border bg-card px-6 py-5">
            <h3 className="m-0 text-base font-semibold text-foreground">
              Travel request summary
            </h3>

            <div className="flex flex-col gap-[0.65rem]">
              {/* Category */}
              <div className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                <span className="text-[0.85rem] font-medium text-muted-foreground">Category</span>
                <span className="text-[0.85rem] font-semibold text-foreground">{category}</span>
              </div>

              {/* Traveller */}
              <div className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                <span className="text-[0.85rem] font-medium text-muted-foreground">Traveller</span>
                <span className="text-[0.85rem] font-semibold text-foreground">
                  {valueOf({ name: 'Traveller' }) || effectiveTraveller || '—'}
                </span>
              </div>

              {/* Purpose */}
              {valueOf({ name: 'Purpose of visit' }) && (
                <div className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                  <span className="text-[0.85rem] font-medium text-muted-foreground">Purpose of visit</span>
                  <span className="break-words text-[0.85rem] font-semibold text-foreground">
                    {valueOf({ name: 'Purpose of visit' })}
                  </span>
                </div>
              )}

              {/* Trip Type */}
              <div className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                <span className="text-[0.85rem] font-medium text-muted-foreground">Trip type</span>
                <span className="text-[0.85rem] font-semibold text-foreground">
                  {valueOf({ name: 'Trip type' }) || '—'}
                </span>
              </div>

              {/* Travel Class */}
              {valueOf({ name: 'Travel class' }) && (
                <div className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                  <span className="text-[0.85rem] font-medium text-muted-foreground">Travel class</span>
                  <span className="text-[0.85rem] font-semibold text-foreground">
                    {valueOf({ name: 'Travel class' })}
                  </span>
                </div>
              )}

              {/* Multi-City Itinerary Leg List */}
              {isMultiCityFlight ? (
                <div className="mt-2 flex flex-col gap-3">
                  <div className="text-[0.85rem] font-bold uppercase tracking-[0.03em] text-foreground">
                    Multi-City Flight Itinerary ({journeySummary})
                  </div>

                  <div className="flex flex-col gap-2">
                    {multiCityLegs.map((leg, idx) => (
                      <div
                        key={leg.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-input px-4 py-3"
                      >
                        <div className="flex items-center gap-[0.65rem]">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            {leg.from} → {leg.to}
                          </span>
                        </div>

                        <div className="flex items-center gap-5 text-[0.8rem] text-muted-foreground">
                          <div className="flex items-center gap-[0.35rem]">
                            <Calendar size={13} />
                            <span className="font-semibold text-foreground">{formatDateDisplay(leg.travelDate)}</span>
                          </div>
                          <div className="flex items-center gap-[0.35rem]">
                            <Clock size={13} />
                            <span>{leg.preferredTime}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Non-multi-city Dynamic Fields */
                visibleFields
                  .filter(f => f.name !== 'Traveller' && f.name !== 'Purpose of visit' && f.name !== 'Trip type' && f.name !== 'Travel class')
                  .map(field => {
                    const val = valueOf(field);
                    if (val === undefined || val === null || val === '') return null;
                    const displayVal = field.type === 'date' ? formatDateDisplay(val) : String(val);

                    return (
                      <div key={field.name} className="grid items-baseline gap-4 [grid-template-columns:minmax(180px,240px)_1fr]">
                        <span className="text-[0.85rem] font-medium text-muted-foreground">
                          {field.name || field.label}
                        </span>
                        <span className="break-words text-[0.85rem] font-semibold text-foreground">
                          {displayVal}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Policy Compliance Checkbox */}
          <div className="flex flex-col gap-[0.35rem] pt-2">
            <div className="flex items-start gap-[0.65rem]">
              <input
                id="certify-travel"
                type="checkbox"
                required
                checked={certified}
                onChange={e => {
                  setCertified(e.target.checked);
                  setMessage('');
                }}
                className="mt-[0.2rem] h-4 w-4 cursor-pointer"
              />
              <label htmlFor="certify-travel" className="cursor-pointer text-[0.85rem] font-medium leading-[1.45] text-foreground">
                I confirm that the information is correct and no booking or financial commitment has been made for this request.
              </label>
            </div>
            {message && <div className="pl-7 text-[0.775rem] font-semibold text-[#DC2626]">{message}</div>}
          </div>

          {/* Bottom Actions */}
          <div className="flex justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border border-border bg-card px-4 py-[0.55rem] text-[0.825rem] font-semibold text-foreground"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              type="submit"
              disabled={!certified || isSubmitting}
              className={`inline-flex items-center gap-[0.45rem] rounded-lg border-none bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white ${
                (!certified || isSubmitting) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <Send size={14} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Travel Booking Request'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
