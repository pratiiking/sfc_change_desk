import React, { useId, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  CheckCircle2,
  Send,
  Paperclip,
  FileText,
  ExternalLink,
  History,
  Sparkles
} from 'lucide-react';
import {
  PRE_SPEND_CATEGORIES,
  SAMPLE_BUDGET_LINES,
  COMMERCIAL_REASONS,
  EXCEPTION_OPTIONS
} from '../lib/preSpend.config.js';
import { FormLabel } from '../components/ui/primitives.component';
import FormStepper from '../components/ui/FormStepper.component';
import ManagerCombobox from '../components/ui/ManagerCombobox.component';
import { apiFetch } from '../lib/apiFetch.lib';

const emptyVendor = () => ({ name: '', amount: '', date: '', file: null, fileName: '' });
const money = value => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const ACTIVE_FIELD_CLASS = 'w-full box-border rounded-[8px] border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] [font-family:inherit] text-foreground outline-none';

const READONLY_FIELD_CLASS = 'w-full box-border rounded-[8px] border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] [font-family:inherit] text-muted-foreground cursor-not-allowed';

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

export default function PreSpendPage({ onNavigate, user, initialCostCentre = '', budgetLines = SAMPLE_BUDGET_LINES }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');

  const [currentSessionUser, setCurrentSessionUser] = useState(() => user || JSON.parse(localStorage.getItem('sfc_user') || '{}'));
  const activeSessionUser = currentSessionUser || user || JSON.parse(localStorage.getItem('sfc_user') || '{}');

  const [requesterDetails, setRequesterDetails] = useState(() => ({
    employeeName: activeSessionUser?.employee?.name || activeSessionUser?.name || '',
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

  const [details, setDetails] = useState({
    buying: '',
    location: '',
    neededBy: '',
    justification: '',
    urgent: false
  });
  const [vendors, setVendors] = useState([emptyVendor(), emptyVendor(), emptyVendor()]);
  const [commercial, setCommercial] = useState({ exception: 'Not applicable', exceptionReason: '', reason: '', justification: '' });
  const [certified, setCertified] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  // Past Vendor Look-up State
  const [pastVendor, setPastVendor] = useState(null);
  const [usePastVendor, setUsePastVendor] = useState(false);
  const [hoveredCat, setHoveredCat] = useState(null);
  const [hoveredSubcat, setHoveredSubcat] = useState(null);

  // Fetch previous preferred vendor whenever subcategory changes
  useEffect(() => {
    if (!subcategory) {
      setPastVendor(null);
      setUsePastVendor(false);
      return;
    }
    const fetchPastVendor = async () => {
      try {
        const res = await apiFetch(`/pre-spend/past-vendor?subcategory=${encodeURIComponent(subcategory)}&category=${encodeURIComponent(category)}`);
        if (res.ok) {
          const body = await res.json();
          if (body.data && body.data.vendorName) {
            setPastVendor(body.data);
          } else {
            setPastVendor(null);
            setUsePastVendor(false);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch past vendor for subcategory:', err);
      }
    };
    fetchPastVendor();
  }, [subcategory, category]);

  const changeDetails = (key, value) => {
    setDetails(old => ({ ...old, [key]: value }));
    setCertified(false);
    setNotice('');
  };

  const changeVendor = (index, key, value) => {
    setVendors(old => old.map((vendor, i) => i === index ? { ...vendor, [key]: value } : vendor));
    setCertified(false);
    setNotice('');
  };

  const changeCommercial = (key, value) => {
    setCommercial(old => ({ ...old, [key]: value }));
    setCertified(false);
    setNotice('');
  };

  const selectedCategory = PRE_SPEND_CATEGORIES.find(item => item.name === category);
  const id = key => `${uid}-${key}`;

  const todayStr = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileToBase64 = (file) => {
    return new Promise((resolve) => {
      if (!file || !(file instanceof Blob || file instanceof File)) {
        resolve(typeof file === 'string' ? file : null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!certified) {
      setNotice('Please confirm the policy certification declaration before submitting.');
      return;
    }
    setIsSubmitting(true);
    setNotice('');
    try {
      const processedVendors = await Promise.all(
        vendors
          .filter(v => v.name || v.amount || v.fileName)
          .map(async (v) => {
            let fileData = v.fileData || null;
            if (v.file instanceof Blob || v.file instanceof File) {
              fileData = await fileToBase64(v.file);
            }
            return {
              name: v.name,
              amount: v.amount,
              date: v.date,
              fileName: v.fileName || (v.file ? v.file.name : ''),
              fileData: fileData
            };
          })
      );

      const payload = {
        category,
        subcategory,
        employeeName: requesterDetails.employeeName || '',
        employeeEmail: requesterDetails.employeeEmail || '',
        employeeId: requesterDetails.employeeId || '',
        managerName: requesterDetails.managerName || '',
        managerEmail: requesterDetails.managerEmail || '',
        buying: details.buying,
        location: requesterDetails.location || details.location,
        neededBy: details.neededBy,
        justification: details.justification,
        urgent: details.urgent,
        vendors: processedVendors,
        commercial,
        certified
      };
      const res = await apiFetch('/pre-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit pre-spend request');
      }
      setCreatedCode(data.data?.requestCode || '');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary-cards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expanded'] });
      queryClient.invalidateQueries({ queryKey: ['worklist'] });
      setSubmitted(true);
    } catch (err) {
      setNotice(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = ['Spend Category', 'Request Details', 'Vendors & Quotes', 'Review & Submit'];

  return (
    <div className="flex w-full flex-col gap-5 pb-12">

      {/* Top Header */}
      <div>
        <h1 className="m-0 text-[1.45rem] leading-[1.2] font-bold text-foreground">
          New Pre-Spend Request
        </h1>
        <p className="m-0 text-[0.875rem] text-muted-foreground">
          Obtain financial approval before placing an order or committing to a vendor
        </p>
      </div>

      {/* Stepper */}
      <FormStepper steps={stepsList} currentStep={step} />

      {/* Success Banner */}
      {submitted && (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[#A7F3D0] bg-[#ECFDF5] p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#059669]">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="m-0 text-[1.25rem] font-bold text-[#065F46]">
            Pre-Spend Request Submitted Successfully
          </h3>
          <p className="m-0 max-w-[480px] text-[0.85rem] leading-[1.5] text-[#047857]">
            Your pre-spend requisition <strong>{createdCode || ''}</strong> for <strong>{details.buying || category}</strong> has been created and sent for approval.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setCreatedCode('');
                setStep(1);
                setCategory('');
                setSubcategory('');
                setDetails({
                  buying: '',
                  location: '',
                  neededBy: '',
                  justification: '',
                  urgent: false
                });
                setVendors([emptyVendor(), emptyVendor(), emptyVendor()]);
                setCommercial({ exception: 'Not applicable', exceptionReason: '', reason: '', justification: '' });
                setCertified(false);
                setNotice('');
                setPastVendor(null);
                setUsePastVendor(false);
                const curr = activeSessionUser;
                setRequesterDetails({
                  employeeName: curr?.employee?.name || curr?.name || '',
                  employeeEmail: curr?.employee?.email || curr?.email || '',
                  employeeId: resolveEmpBusinessId(curr, ''),
                  location: resolveEmpLocation(curr, ''),
                  managerName: '',
                  managerEmail: ''
                });
              }}
              className="cursor-pointer rounded-[8px] border-0 bg-[#047857] px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              Create Another Request
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('Dashboard')}
              className="cursor-pointer rounded-[8px] border border-[#A7F3D0] bg-transparent px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-[#065F46]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: Category */}
      {!submitted && step === 1 && (
        <div className="flex flex-col gap-6 rounded-[12px] border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-foreground">
                1. Select Spend Category
              </h3>
              <span className="text-[0.775rem] font-semibold text-muted-foreground">
                Step 1 of 4
              </span>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {PRE_SPEND_CATEGORIES.map(item => {
                const selected = category === item.name;
                const isHovered = hoveredCat === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      setCategory(item.name);
                      setSubcategory('');
                    }}
                    onMouseEnter={() => setHoveredCat(item.name)}
                    onMouseLeave={() => setHoveredCat(null)}
                    className={`flex min-h-[92px] cursor-pointer flex-col justify-center rounded-[12px] p-[1.1rem] text-left transition-[transform,border-color,box-shadow,background-color] duration-200 ${
                      isHovered ? '-translate-y-[5px]' : 'translate-y-0'
                    } ${
                      selected
                        ? 'border-2 border-primary bg-input shadow-[0_0_0_3px_rgba(23,60,78,0.12)]'
                        : isHovered
                        ? 'border-[1.5px] border-primary bg-card shadow-[0_12px_24px_-4px_rgba(23,60,78,0.14),0_4px_12px_-2px_rgba(0,0,0,0.06)]'
                        : 'border border-border bg-card shadow-[0_1px_3px_rgba(16,21,30,0.04)]'
                    }`}
                  >
                    <div className="text-[0.875rem] font-semibold text-foreground">{item.name}</div>
                    <div className="mt-1 text-[0.775rem] leading-[1.4] text-muted-foreground">{item.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCategory && (
            <div className="border-t border-border pt-5">
              <h3 className="mt-0 mr-0 mb-3 ml-0 text-base font-semibold text-foreground">
                2. Select Subcategory for {selectedCategory.name}
              </h3>
              <div className="grid gap-[0.6rem] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                {selectedCategory.subcategories.map(sub => {
                  const selected = subcategory === sub;
                  const isHovered = hoveredSubcat === sub;
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSubcategory(sub)}
                      onMouseEnter={() => setHoveredSubcat(sub)}
                      onMouseLeave={() => setHoveredSubcat(null)}
                      className={`cursor-pointer rounded-[8px] bg-transparent px-[0.85rem] py-[0.65rem] text-left text-[0.825rem] text-foreground transition-[transform,border-color,box-shadow] duration-[180ms] ${
                        selected ? 'font-semibold' : 'font-medium'
                      } ${isHovered ? '-translate-y-[3px]' : 'translate-y-0'} ${
                        selected
                          ? 'border-2 border-primary shadow-[0_0_0_3px_rgba(23,60,78,0.12)]'
                          : isHovered
                          ? 'border-[1.5px] border-primary shadow-[0_6px_14px_-2px_rgba(23,60,78,0.12)]'
                          : 'border border-border shadow-none'
                      }`}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="button"
              disabled={!category || !subcategory}
              onClick={() => setStep(2)}
              className={`inline-flex items-center gap-[0.45rem] rounded-[8px] border-0 bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white ${
                (!category || !subcategory) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <span>Next: Request Details</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Request Details */}
      {!submitted && step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!requesterDetails.managerName || !requesterDetails.managerEmail) {
              setNotice('Please select a Reporting Manager.');
              return;
            }
            setNotice('');
            setStep(3);
          }}
          className="flex flex-col gap-6 rounded-[12px] border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]"
        >
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
                excludeEmail={activeSessionUser?.employee?.email || activeSessionUser?.email || ''}
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

          {/* Section 2: Requisition Details */}
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-semibold text-foreground">
              Requisition Details ({category} - {subcategory})
            </h3>
            <span className="text-[0.775rem] font-semibold text-muted-foreground">
              Section 2 of 2
            </span>
          </div>

          <div className="cd-responsive-form-grid">
            <div className="col-span-full">
              <FormLabel required htmlFor={id('buying')}>What are you buying?</FormLabel>
              <input
                id={id('buying')}
                type="text"
                required
                value={details.buying}
                onChange={e => changeDetails('buying', e.target.value)}
                placeholder="Item / service description, quantity and brief spec"
                className={ACTIVE_FIELD_CLASS}
              />
            </div>

            <div>
              <FormLabel required htmlFor={id('location')}>Location / URL</FormLabel>
              <input
                id={id('location')}
                type="text"
                required
                value={details.location}
                onChange={e => changeDetails('location', e.target.value)}
                placeholder="Enter Location / URL"
                className={ACTIVE_FIELD_CLASS}
              />
            </div>

            <div>
              <FormLabel required htmlFor={id('neededBy')}>Needed By Date</FormLabel>
              <input
                id={id('neededBy')}
                type="date"
                required
                min={todayStr}
                value={details.neededBy}
                onChange={e => changeDetails('neededBy', e.target.value)}
                className={ACTIVE_FIELD_CLASS}
              />
            </div>

            <div className="col-span-full">
              <FormLabel required htmlFor={id('justification')}>Business Justification</FormLabel>
              <textarea
                id={id('justification')}
                rows={3}
                required
                value={details.justification}
                onChange={e => changeDetails('justification', e.target.value)}
                placeholder="Why is this purchase required? What is the business impact if delayed?"
                className={`${ACTIVE_FIELD_CLASS} resize-y`}
              />
            </div>

            <div className="col-span-full flex items-center gap-2 pt-2">
              <input
                id={id('urgent')}
                type="checkbox"
                checked={details.urgent}
                onChange={e => changeDetails('urgent', e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              <label htmlFor={id('urgent')} className="cursor-pointer text-[0.825rem] font-medium text-foreground">
                Mark as urgent requirement
              </label>
            </div>
          </div>

          {/* Warning banner above Back and Next buttons */}
          {notice && (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[0.825rem] font-semibold text-[#DC2626]">
              {notice}
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => { setNotice(''); setStep(1); }}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[8px] border border-border bg-card px-4 py-[0.55rem] text-[0.825rem] font-semibold text-foreground"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[8px] border-0 bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              <span>Next: Vendors & Quotes</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Vendors & Quotes */}
      {!submitted && step === 3 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(4); }} className="flex flex-col gap-7 rounded-[16px] border border-border bg-card p-8 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div>
            <h2 className="m-0 text-[1.25rem] font-semibold text-foreground">
              Vendors & Quotes
            </h2>
            <p className="mt-1 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
              Compare your preferred vendor with available alternatives.
            </p>
          </div>

          {/* Previous Approved Vendor Reference Banner (If available for this Subcategory) */}
          {pastVendor && (
            <div className={`flex flex-col gap-3 rounded-[12px] border-[1.5px] px-5 py-4 transition-all duration-200 ${
              usePastVendor ? 'border-[#10B981] bg-[#F0FDF4]' : 'border-[#CBD5E1] bg-[#F8FAFC]'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-[8px] ${
                    usePastVendor ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#E2E8F0] text-[#475569]'
                  }`}>
                    <History size={15} />
                  </div>
                  <div>
                    <span className="flex items-center gap-[0.35rem] text-[0.825rem] font-semibold text-[#0F172A]">
                      Previously Selected Vendor for <span className="text-primary">{pastVendor.subcategory || subcategory}</span>
                      <span className="rounded-[4px] border border-[#CBD5E1] bg-white px-[0.4rem] py-[0.1rem] text-[0.65rem] font-semibold text-primary">History</span>
                    </span>
                  </div>
                </div>

                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-[8px] px-[0.85rem] py-[0.4rem] text-[0.8rem] font-semibold transition-all duration-150 select-none ${
                  usePastVendor ? 'border border-[#059669] bg-[#10B981] text-white' : 'border border-[#CBD5E1] bg-white text-[#0F172A]'
                }`}>
                  <input
                    type="checkbox"
                    checked={usePastVendor}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUsePastVendor(checked);
                      if (checked) {
                        setVendors([
                          {
                            name: pastVendor.vendorName || '',
                            amount: pastVendor.vendorAmount || details.amount || '',
                            date: pastVendor.quoteDate || todayStr,
                            file: null,
                            fileName: 'Previously Approved Vendor'
                          },
                          emptyVendor(),
                          emptyVendor()
                        ]);
                      }
                    }}
                    className="h-[15px] w-[15px] cursor-pointer"
                  />
                  <span>{usePastVendor ? 'Past Vendor Selected' : 'Select this past vendor'}</span>
                </label>
              </div>

              <div className={`grid gap-3 rounded-[8px] border border-[#E2E8F0] px-4 py-3 text-[0.8rem] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] ${
                usePastVendor ? 'bg-white' : 'bg-[#F1F5F9]'
              }`}>
                <div>
                  <span className="block text-[0.7rem] font-semibold text-[#64748B] uppercase">Vendor Name</span>
                  <span className="text-[0.875rem] font-semibold text-[#0F172A]">{pastVendor.vendorName}</span>
                </div>
                <div>
                  <span className="block text-[0.7rem] font-semibold text-[#64748B] uppercase">Subcategory</span>
                  <span className="font-semibold text-[#0F172A]">{pastVendor.subcategory || subcategory}</span>
                </div>
                <div>
                  <span className="block text-[0.7rem] font-semibold text-[#64748B] uppercase">Historical Cost</span>
                  <span className="[font-family:var(--font-mono)] font-semibold text-[#059669]">{pastVendor.vendorAmount ? money(pastVendor.vendorAmount) : '—'}</span>
                </div>
                <div>
                  <span className="block text-[0.7rem] font-semibold text-[#64748B] uppercase">Quote Date</span>
                  <span className="[font-family:var(--font-mono)] font-semibold text-[#0F172A]">{pastVendor.quoteDate || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* 2x2 Grid for Vendor Cards and Quote Exception */}
          {(() => {
            const isVendor1Started = Boolean(
              vendors[1]?.name?.trim() ||
              vendors[1]?.amount ||
              vendors[1]?.date ||
              vendors[1]?.fileName
            );
            const isExceptionSelected = Boolean(
              commercial.exception &&
              commercial.exception !== 'Not applicable'
            );

            // Vendor 1 is disabled if an exception is selected
            const isVendor1Disabled = isExceptionSelected;
            // Vendor 2 is disabled unless Vendor 1 has been started AND no exception is selected
            const isVendor2Disabled = !isVendor1Started || isExceptionSelected;
            // Quote Exception is disabled if Vendor 1 has been started
            const isExceptionDisabled = isVendor1Started;

            const DISABLED_CARD_CLASS = 'border-border bg-input opacity-[0.55] pointer-events-none grayscale-[60%]';

            return (
              <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
                {/* 1. Preferred Vendor */}
                <div className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-[#10B981] bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.95rem] font-semibold text-foreground">
                      Preferred Vendor
                    </span>
                    <span className="rounded-[12px] bg-[#E6F4EA] px-[0.65rem] py-[0.2rem] text-[0.75rem] font-bold text-[#137333]">
                      Preferred
                    </span>
                  </div>

                  <div>
                    <FormLabel required={!usePastVendor} htmlFor="vendor-0-name">Vendor name</FormLabel>
                    <input
                      id="vendor-0-name"
                      type="text"
                      required={!usePastVendor && (!commercial.exception || commercial.exception === 'Not applicable')}
                      value={vendors[0]?.name || ''}
                      onChange={e => changeVendor(0, 'name', e.target.value)}
                      placeholder="Search or enter vendor"
                      className={ACTIVE_FIELD_CLASS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FormLabel required={!usePastVendor} htmlFor="vendor-0-amount">Quoted amount (₹)</FormLabel>
                      <input
                        id="vendor-0-amount"
                        type="number"
                        step="any"
                        required={!usePastVendor && (!commercial.exception || commercial.exception === 'Not applicable')}
                        value={vendors[0]?.amount || ''}
                        onChange={e => changeVendor(0, 'amount', e.target.value)}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                        className={ACTIVE_FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <FormLabel htmlFor="vendor-0-date">Quote date</FormLabel>
                      <input
                        id="vendor-0-date"
                        type="date"
                        value={vendors[0]?.date || ''}
                        onChange={e => changeVendor(0, 'date', e.target.value)}
                        className={ACTIVE_FIELD_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <FormLabel htmlFor="vendor-0-file">Upload quotation</FormLabel>
                    <input
                      id="vendor-0-file"
                      type="file"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          changeVendor(0, 'file', f);
                          changeVendor(0, 'fileName', f.name);
                        }
                      }}
                    />
                    <label
                      htmlFor="vendor-0-file"
                      className={`flex h-[42px] cursor-pointer items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[8px] border border-dashed border-border bg-card px-4 text-center text-[0.85rem] font-medium ${
                        vendors[0]?.fileName ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {vendors[0]?.fileName ? vendors[0].fileName : 'Choose PDF, image or email quotation'}
                    </label>
                  </div>
                </div>

                {/* 2. Alternative Vendor 1 */}
                <div className={`flex flex-col gap-4 rounded-[14px] border border-border bg-card p-6 transition-all duration-200 ${isVendor1Disabled ? DISABLED_CARD_CLASS : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.95rem] font-semibold text-foreground">
                      Alternative Vendor 1
                    </span>
                    {isVendor1Disabled && (
                      <span className="text-[0.75rem] font-medium text-[#94A3B8]">
                        Locked (Exception Selected)
                      </span>
                    )}
                  </div>

                  <div>
                    <FormLabel htmlFor="vendor-1-name">Vendor name</FormLabel>
                    <input
                      id="vendor-1-name"
                      type="text"
                      disabled={isVendor1Disabled}
                      value={vendors[1]?.name || ''}
                      onChange={e => {
                        changeVendor(1, 'name', e.target.value);
                        if (e.target.value.trim() && commercial.exception && commercial.exception !== 'Not applicable') {
                          changeCommercial('exception', 'Not applicable');
                          changeCommercial('exceptionReason', '');
                        }
                      }}
                      placeholder="Enter vendor"
                      className={isVendor1Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FormLabel htmlFor="vendor-1-amount">Quoted amount (₹)</FormLabel>
                      <input
                        id="vendor-1-amount"
                        type="number"
                        step="any"
                        disabled={isVendor1Disabled}
                        value={vendors[1]?.amount || ''}
                        onChange={e => {
                          changeVendor(1, 'amount', e.target.value);
                          if (e.target.value && commercial.exception && commercial.exception !== 'Not applicable') {
                            changeCommercial('exception', 'Not applicable');
                            changeCommercial('exceptionReason', '');
                          }
                        }}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                        className={isVendor1Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <FormLabel htmlFor="vendor-1-date">Quote date</FormLabel>
                      <input
                        id="vendor-1-date"
                        type="date"
                        disabled={isVendor1Disabled}
                        value={vendors[1]?.date || ''}
                        onChange={e => {
                          changeVendor(1, 'date', e.target.value);
                          if (e.target.value && commercial.exception && commercial.exception !== 'Not applicable') {
                            changeCommercial('exception', 'Not applicable');
                            changeCommercial('exceptionReason', '');
                          }
                        }}
                        className={isVendor1Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <FormLabel htmlFor="vendor-1-file">Upload quotation</FormLabel>
                    <input
                      id="vendor-1-file"
                      type="file"
                      disabled={isVendor1Disabled}
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          changeVendor(1, 'file', f);
                          changeVendor(1, 'fileName', f.name);
                          if (commercial.exception && commercial.exception !== 'Not applicable') {
                            changeCommercial('exception', 'Not applicable');
                            changeCommercial('exceptionReason', '');
                          }
                        }
                      }}
                    />
                    <label
                      htmlFor={isVendor1Disabled ? undefined : "vendor-1-file"}
                      className={`flex h-[42px] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[8px] border border-dashed border-border px-4 text-center text-[0.85rem] font-medium ${
                        isVendor1Disabled ? 'cursor-not-allowed bg-input' : 'cursor-pointer bg-card'
                      } ${vendors[1]?.fileName ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {vendors[1]?.fileName ? vendors[1].fileName : 'Choose quotation file'}
                    </label>
                  </div>
                </div>

                {/* 3. Alternative Vendor 2 */}
                <div className={`flex flex-col gap-4 rounded-[14px] border border-border bg-card p-6 transition-all duration-200 ${isVendor2Disabled ? DISABLED_CARD_CLASS : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.95rem] font-semibold text-foreground">
                      Alternative Vendor 2
                    </span>
                    <span className={`text-[0.75rem] font-medium ${isVendor2Disabled ? 'text-[#94A3B8]' : 'text-muted-foreground'}`}>
                      {isVendor2Disabled ? 'Locked (Fill Vendor 1 first)' : 'Optional'}
                    </span>
                  </div>

                  <div>
                    <FormLabel htmlFor="vendor-2-name">Vendor name</FormLabel>
                    <input
                      id="vendor-2-name"
                      type="text"
                      disabled={isVendor2Disabled}
                      value={vendors[2]?.name || ''}
                      onChange={e => changeVendor(2, 'name', e.target.value)}
                      placeholder={isVendor2Disabled ? 'Complete Alternative Vendor 1 first' : 'Enter vendor'}
                      className={isVendor2Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FormLabel htmlFor="vendor-2-amount">Quoted amount (₹)</FormLabel>
                      <input
                        id="vendor-2-amount"
                        type="number"
                        step="any"
                        disabled={isVendor2Disabled}
                        value={vendors[2]?.amount || ''}
                        onChange={e => changeVendor(2, 'amount', e.target.value)}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                        className={isVendor2Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <FormLabel htmlFor="vendor-2-date">Quote date</FormLabel>
                      <input
                        id="vendor-2-date"
                        type="date"
                        disabled={isVendor2Disabled}
                        value={vendors[2]?.date || ''}
                        onChange={e => changeVendor(2, 'date', e.target.value)}
                        className={isVendor2Disabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <FormLabel htmlFor="vendor-2-file">Upload quotation</FormLabel>
                    <input
                      id="vendor-2-file"
                      type="file"
                      disabled={isVendor2Disabled}
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) {
                          changeVendor(2, 'file', f);
                          changeVendor(2, 'fileName', f.name);
                        }
                      }}
                    />
                    <label
                      htmlFor={isVendor2Disabled ? undefined : "vendor-2-file"}
                      className={`flex h-[42px] items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[8px] border border-dashed border-border px-4 text-center text-[0.85rem] font-medium ${
                        isVendor2Disabled ? 'cursor-not-allowed bg-input' : 'cursor-pointer bg-card'
                      } ${vendors[2]?.fileName ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {vendors[2]?.fileName ? vendors[2].fileName : 'Choose quotation file'}
                    </label>
                  </div>
                </div>

                {/* 4. Quote Exception Card */}
                <div className={`flex flex-col gap-4 rounded-[14px] border border-border bg-card p-6 transition-all duration-200 ${isExceptionDisabled ? DISABLED_CARD_CLASS : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.95rem] font-semibold text-foreground">
                      Quote Exception
                    </span>
                    {isExceptionDisabled && (
                      <span className="text-[0.75rem] font-medium text-[#94A3B8]">
                        Locked (Vendor 1 Added)
                      </span>
                    )}
                  </div>

                  <div>
                    <FormLabel htmlFor="commercial-exception">If alternative quotes are unavailable</FormLabel>
                    <select
                      id="commercial-exception"
                      disabled={isExceptionDisabled}
                      value={commercial.exception}
                      onChange={e => {
                        const val = e.target.value;
                        changeCommercial('exception', val);
                        if (val && val !== 'Not applicable') {
                          // Reset Alternative vendors 1 and 2
                          setVendors(prev => [prev[0], emptyVendor(), emptyVendor()]);
                        }
                      }}
                      className={isExceptionDisabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                    >
                      {EXCEPTION_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-1 flex-col">
                    <FormLabel htmlFor="exception-justification">Exception justification</FormLabel>
                    <textarea
                      id="exception-justification"
                      rows={3}
                      disabled={isExceptionDisabled}
                      value={commercial.exceptionReason}
                      onChange={e => changeCommercial('exceptionReason', e.target.value)}
                      placeholder={isExceptionDisabled ? 'Not required when alternative vendors are provided' : 'Explain why comparison quotes are not available'}
                      className={`${isExceptionDisabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS} min-h-[74px] flex-1 resize-y`}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Selection Reason and Commercial Justification Fields */}
          <div className="flex flex-col gap-5">
            <div>
              <FormLabel required htmlFor="commercial-reason">Why have you selected this vendor?</FormLabel>
              <select
                id="commercial-reason"
                required
                value={commercial.reason}
                onChange={e => changeCommercial('reason', e.target.value)}
                className={ACTIVE_FIELD_CLASS}
              >
                <option value="">Select primary reason</option>
                {COMMERCIAL_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <FormLabel required htmlFor="vendor-selection-justification">Vendor selection justification</FormLabel>
              <textarea
                id="vendor-selection-justification"
                rows={3}
                required
                value={commercial.justification}
                onChange={e => changeCommercial('justification', e.target.value)}
                placeholder="Explain the commercial and operational reason for selecting this vendor"
                className={`${ACTIVE_FIELD_CLASS} min-h-[80px] resize-y`}
              />
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[8px] border border-border bg-card px-[1.35rem] py-[0.65rem] text-[0.875rem] font-semibold text-foreground"
            >
              <span>Back</span>
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[8px] border-0 bg-[#0F172A] px-[1.6rem] py-[0.65rem] text-[0.875rem] font-semibold text-white"
            >
              <span>Review Request</span>
            </button>
          </div>
        </form>
      )}

      {/* STEP 4: Review & Submit */}
      {!submitted && step === 4 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-7 rounded-[16px] border border-border bg-card p-8 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="m-0 text-[1.25rem] font-semibold text-foreground">
                Review Pre-Spend Request
              </h2>
              <p className="mt-1 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
                Verify all spend information, vendor quotes, and attachments before submitting for approval
              </p>
            </div>
            <span className="rounded-[6px] border border-border bg-input px-[0.65rem] py-[0.3rem] text-[0.8rem] font-semibold text-muted-foreground">
              Step 4 of 4
            </span>
          </div>

          {/* Section 1: Request Details */}
          <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="border-b border-border bg-card px-5 py-3 text-[0.85rem] font-semibold text-foreground">
              1. Request Details
            </div>
            <div className="grid gap-4 p-5 text-[0.85rem] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              <div>
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Category / Subcategory</span>
                <span className="font-semibold text-foreground">{category} — {subcategory}</span>
              </div>
              <div>
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Location / URL</span>
                <span className="font-semibold text-foreground">{details.location || '—'}</span>
              </div>
              <div>
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Request Date</span>
                <span className="font-semibold text-foreground">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div>
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Needed By Date</span>
                <span className="font-semibold text-foreground">{details.neededBy || '—'}</span>
              </div>
              <div className="col-span-full">
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">What are you buying? (Scope & Spec)</span>
                <p className="mt-1 mr-0 mb-0 ml-0 leading-[1.5] whitespace-pre-wrap text-foreground">{details.buying}</p>
              </div>
              <div className="col-span-full">
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Business Justification</span>
                <p className="mt-1 mr-0 mb-0 ml-0 leading-[1.5] whitespace-pre-wrap text-muted-foreground">{details.justification}</p>
              </div>
              {details.urgent && (
                <div className="col-span-full rounded-[8px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3">
                  <span className="block text-[0.8rem] font-semibold text-[#DC2626]">URGENT REQUIREMENT</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Vendors & Quotations Comparison */}
          <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="border-b border-border bg-card px-5 py-3 text-[0.85rem] font-semibold text-foreground">
              2. Vendor Quotations & Comparison
            </div>
            <div className="grid gap-4 p-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {vendors.filter(v => v.name?.trim() || v.amount || v.fileName).map((v, i) => (
                <div key={i} className={`flex flex-col gap-[0.65rem] rounded-[10px] p-4 ${
                  i === 0 ? 'border-[1.5px] border-[#10B981] bg-[#F0FDF4]' : 'border border-[#E2E8F0] bg-white'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.875rem] font-semibold text-foreground">
                      {i === 0 ? 'Preferred Vendor' : `Alternative Vendor ${i}`}
                    </span>
                    {i === 0 && (
                      <span className={`rounded-[10px] px-2 py-[0.15rem] text-[0.7rem] font-semibold ${
                        usePastVendor ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#E6F4EA] text-[#137333]'
                      }`}>
                        {usePastVendor ? '✓ Past Selected Vendor' : 'Selected'}
                      </span>
                    )}
                  </div>

                  <div className="text-[0.825rem]">
                    <span className="block text-[0.75rem] text-[#64748B]">Vendor Name</span>
                    <strong className="text-[#0F172A]">{v.name || '—'}</strong>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[0.825rem]">
                    <div>
                      <span className="block text-[0.75rem] text-[#64748B]">Quoted Amount</span>
                      <strong className="[font-family:var(--font-mono)] text-[#0F172A]">{v.amount ? money(v.amount) : '₹0'}</strong>
                    </div>
                    <div>
                      <span className="block text-[0.75rem] text-[#64748B]">Quote Date</span>
                      <strong className="text-[#0F172A]">{v.date || '—'}</strong>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-[#CBD5E1] pt-[0.35rem] text-[0.825rem]">
                    <span className="mb-1 block text-[0.75rem] text-[#64748B]">Attached Quotation</span>
                    {v.file || v.fileName ? (
                      <button
                        type="button"
                        title="Click to preview attached quotation file"
                        onClick={(e) => {
                          e.preventDefault();
                          if (v.file instanceof Blob || v.file instanceof File) {
                            const fileUrl = URL.createObjectURL(v.file);
                            window.open(fileUrl, '_blank');
                          } else if (typeof v.file === 'string' && v.file.startsWith('http')) {
                            window.open(v.file, '_blank');
                          } else {
                            alert(`Quotation file: ${v.fileName || 'Document attached'}`);
                          }
                        }}
                        className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[6px] border border-[#BFDBFE] bg-[#EFF6FF] px-[0.65rem] py-[0.35rem] text-[0.8rem] font-semibold text-[#1D4ED8] transition-all duration-150"
                      >
                        <FileText size={14} />
                        <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {v.fileName || 'View Quotation'}
                        </span>
                        <ExternalLink size={12} className="opacity-70" />
                      </button>
                    ) : (
                      <span className="text-[0.8rem] text-[#94A3B8] italic">No quotation file uploaded</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Commercial Evaluation & Justification */}
          <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="border-b border-border bg-card px-5 py-3 text-[0.85rem] font-semibold text-foreground">
              3. Commercial Evaluation & Justification
            </div>
            <div className="flex flex-col gap-[0.85rem] p-5 text-[0.85rem]">
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                <div>
                  <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Reason for Vendor Selection</span>
                  <span className="font-semibold text-foreground">{commercial.reason || '—'}</span>
                </div>
                <div>
                  <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Quote Exception Rule</span>
                  <span className="font-semibold text-foreground">{commercial.exception || 'Not applicable'}</span>
                </div>
              </div>

              {commercial.exception && commercial.exception !== 'Not applicable' && commercial.exceptionReason && (
                <div>
                  <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Exception Justification</span>
                  <p className="mt-[0.2rem] mr-0 mb-0 ml-0 leading-[1.5] text-muted-foreground">{commercial.exceptionReason}</p>
                </div>
              )}

              <div>
                <span className="block text-[0.75rem] font-semibold text-muted-foreground uppercase">Vendor Selection Justification</span>
                <p className="mt-[0.2rem] mr-0 mb-0 ml-0 leading-[1.5] whitespace-pre-wrap text-muted-foreground">{commercial.justification || '—'}</p>
              </div>
            </div>
          </div>

          {/* Section 4: Confirmation Checkbox */}
          <div className="flex flex-col gap-2 border-t border-b border-border py-4">
            <div className="flex items-center gap-3">
              <input
                id="certify"
                type="checkbox"
                required
                checked={certified}
                onChange={e => {
                  setCertified(e.target.checked);
                  setNotice('');
                }}
                className="h-[18px] w-[18px] cursor-pointer accent-[#2563EB]"
              />
              <label htmlFor="certify" className="cursor-pointer text-[0.9rem] leading-[1.45] font-medium text-foreground">
                I confirm that no order, payment or vendor commitment has been made and the information provided is correct.
              </label>
            </div>
            {notice && <div className="pl-[2.1rem] text-[0.775rem] font-semibold text-[#DC2626]">{notice}</div>}
          </div>

          {/* Navigation & Submit Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-[8px] border border-border bg-card px-[1.35rem] py-[0.65rem] text-[0.875rem] font-semibold text-foreground"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              type="submit"
              disabled={!certified || isSubmitting}
              className={`inline-flex items-center gap-2 rounded-[8px] border-0 bg-[#0F172A] px-7 py-3 text-[0.9rem] font-semibold text-white ${
                (!certified || isSubmitting) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <Send size={15} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Pre-Spend Request'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
