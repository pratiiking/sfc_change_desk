import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, ArrowLeft, ArrowRight, CheckCircle2, Edit3 } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch.lib';
import { getSession } from '../lib/auth.lib';
import { FormLabel } from '../components/ui/primitives.component';
import FormStepper from '../components/ui/FormStepper.component';
import ManagerCombobox from '../components/ui/ManagerCombobox.component';
import { ROLE } from '../lib/permissions.lib';

export const RESTRICTED_ACTIONS = [
  'create an email id',
  'disable / revoke mailbox',
  'request m365 license',
  'remove m365 license',
  'request for procurement of laptop / desktop',
  'repair request',
  'dispose request',
  'request for procurement of it hardware / accessories',
  'request physical access',
  'revoke physical access'
];

export const getFieldOptions = (field, currentUser) => {
  if (field?.fieldKey === 'hostingType') {
    return ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise'];
  }
  let opts = field?.options ? [...field.options] : [];
  if (field?.fieldKey === 'actionRequired' && !opts.includes('Other')) {
    opts.push('Other');
  }
  const isSuperAdmin = Boolean(
    currentUser?.isSuperAdmin ||
    currentUser?.roleId === ROLE.SUPER_ADMIN ||
    currentUser?.role === 'Super Admin' ||
    currentUser?.role === 'ChangeDesk Super Admin' ||
    currentUser?.roleName === 'Super Admin' ||
    currentUser?.roleName === 'ChangeDesk Super Admin'
  );
  const hasRestrictedAccess = isSuperAdmin || currentUser?.isInUserTable === true;
  if (field?.fieldKey === 'actionRequired' && currentUser && !hasRestrictedAccess) {
    opts = opts.filter(opt => !RESTRICTED_ACTIONS.includes(String(opt).trim().toLowerCase()));
  }
  return opts;
};

const CATEGORY_DESCRIPTIONS = {
  'IT Asset': 'Computers, hardware, software and licences',
  'Office 365 & Collaboration': 'Mailboxes, Microsoft 365 licences and email services',
  'Access & Security': 'Application permissions and physical access',
  'Network & Connectivity': 'Firewall rules, website access and VPN connections',
  'Security Tools & Policies': 'Endpoint protection and security changes',
  'Server & Infra': 'Server setup, lifecycle changes and OS patching'
};

const READONLY_FIELD_CLASS = 'box-border w-full cursor-not-allowed rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-muted-foreground outline-none';

const ACTIVE_FIELD_CLASS = 'box-border w-full rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none';

function ChangeRequestFormPage({ onNavigate, user, initialData, searchQuery = '' }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(() => (initialData?.category || initialData?.subCategory ? 2 : 1));
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategories, setSubcategories] = useState([]);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [fields, setFields] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [hoveredCatId, setHoveredCatId] = useState(null);
  const [hoveredSubId, setHoveredSubId] = useState(null);
  const [certified, setCertified] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const [currentSessionUser, setCurrentSessionUser] = useState(() => user || getSession()?.user);
  const activeSessionUser = currentSessionUser || user || getSession()?.user;
  const [errorMessage, setErrorMessage] = useState('');

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

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState(() => ({
    title: initialData?.title || '',
    startDate: initialData?.startDate || getTodayDateString(),
    endDate: initialData?.endDate || '',
    justification: initialData?.justification || initialData?.description || '',
    employeeName: initialData?.employeeName || activeSessionUser?.employee?.name || activeSessionUser?.name || '',
    employeeEmail: initialData?.employeeEmail || activeSessionUser?.employee?.email || activeSessionUser?.email || '',
    employeeId: resolveEmpBusinessId(activeSessionUser, initialData?.employeeId),
    location: resolveEmpLocation(activeSessionUser, initialData?.location),
    managerName: initialData?.managerName || initialData?.customFieldValues?.managerName || '',
    managerEmail: initialData?.managerEmail || ''
  }));

  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Fetch active employees for Manager dropdown from employees table
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await apiFetch('/users');
        if (res.ok) {
          const body = await res.json();
          const list = body.data || body.users || [];
          if (Array.isArray(list)) {
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

  // Sync logged in user details if loaded async or refetched
  useEffect(() => {
    const currentUser = user || getSession()?.user;
    if (currentUser) {
      setCurrentSessionUser(currentUser);
      setFormData((prev) => ({
        ...prev,
        employeeName: prev.employeeName || currentUser.employee?.name || currentUser.name || '',
        employeeEmail: prev.employeeEmail || currentUser.employee?.email || currentUser.email || '',
        employeeId: resolveEmpBusinessId(currentUser, prev.employeeId),
        location: resolveEmpLocation(currentUser, prev.location)
      }));
    }
  }, [user]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // 1. Load Categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await apiFetch('/catalog/categories');
        if (res.ok) {
          const body = await res.json();
          if (body.data && Array.isArray(body.data)) {
            body.data.forEach(c => {
              if (c.subcategories && Array.isArray(c.subcategories)) {
                c.subcategories.forEach(s => {
                  if (s.id === 'subcat-sec-ep' || s.name === 'End Point Agent') {
                    s.name = 'Endpoint Agent';
                  }
                });
              }
            });
            setCategories(body.data);
            
            const reqCatName = (initialData?.category || initialData?.categoryName || '').trim().toLowerCase();
            if (reqCatName) {
              const targetCat = body.data.find(c => c.name.trim().toLowerCase() === reqCatName || reqCatName.includes(c.name.trim().toLowerCase()));
              if (targetCat) {
                setSelectedCategoryId(targetCat.id);
                if (targetCat.subcategories && targetCat.subcategories.length > 0) {
                  setSubcategories(targetCat.subcategories);
                  const reqSubName = (initialData?.subCategory || initialData?.title || initialData?.name || '').trim().toLowerCase();
                  const targetSub = targetCat.subcategories.find(s =>
                    (initialData?.subcategoryId && s.id === initialData.subcategoryId) ||
                    (initialData?.id && s.id === initialData.id) ||
                    (reqSubName && s.name.trim().toLowerCase() === reqSubName) ||
                    (reqSubName && reqSubName.includes(s.name.trim().toLowerCase()))
                  );
                  if (targetSub) {
                    setSelectedSubcategoryId(targetSub.id);
                    setSelectedSubcategory(targetSub);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load catalog categories:', err);
      }
    };
    fetchCategories();
  }, [initialData]);

  // 2. Handle Category selection change
  const handleCategoryChange = (catId) => {
    setSelectedCategoryId(catId);
    setSelectedSubcategoryId('');
    setSelectedSubcategory(null);
    setCustomFieldValues({});
    const cat = categories.find((c) => c.id === catId);
    if (cat && cat.subcategories && cat.subcategories.length > 0) {
      setSubcategories(cat.subcategories);
    } else {
      setSubcategories([]);
      setFields([]);
    }
  };

  // 3. Handle Subcategory selection change & load fields
  useEffect(() => {
    if (!selectedSubcategoryId) return;
    const fetchFields = async () => {
      setFieldsLoading(true);
      try {
        const res = await apiFetch(`/catalog/subcategories/${selectedSubcategoryId}/fields`);
        if (res.ok) {
          const body = await res.json();
          if (body.data) {
            let fetchedFields = Array.isArray(body.data) ? body.data : (body.data.fields || []);

            const isOtherSubcat =
              selectedSubcategoryId === 'subcat-srv-oth' ||
              selectedSubcategoryId === 'subcat-net-oth' ||
              selectedSubcategoryId === 'subcat-acc-oth' ||
              selectedSubcategoryId === 'subcat-asset-oth' ||
              selectedSubcategoryId === 'subcat-o365-oth' ||
              selectedSubcategoryId === 'subcat-sec-oth';

            const hasActionRequired = fetchedFields.some((f) => f.fieldKey === 'actionRequired');

            if (isOtherSubcat) {
              fetchedFields = fetchedFields.filter(f => f.fieldKey !== 'actionRequired');
              fetchedFields.unshift({
                id: 'field-auto-action-req-other',
                fieldKey: 'actionRequired',
                fieldLabel: 'Action Required',
                fieldType: 'text',
                isRequired: true,
                defaultValue: 'Other',
                options: ['Other'],
                appliesToActions: ['Other']
              });
            } else if (!hasActionRequired) {
              let defaultActionOptions = ['Provision / Setup', 'Modify / Update', 'Decommission / Revoke', 'Other'];
              const subNameLower = (selectedSubcategory?.name || body.data.name || '').toLowerCase();
              const catNameLower = (body.data.category?.name || categories.find(c => c.id === selectedCategoryId)?.name || '').toLowerCase();

              if (catNameLower.includes('it asset') || subNameLower.includes('laptop') || subNameLower.includes('desktop') || subNameLower.includes('hardware')) {
                defaultActionOptions = [
                  'Procure New Asset',
                  'Replace Damaged / Faulty Asset',
                  'Temporary Standby Allocation',
                  'Upgrade RAM / SSD Storage',
                  'Return / Offboarding Handover',
                  'Dispose / E-Waste Scrap',
                  'Other'
                ];
              } else if (catNameLower.includes('security') || catNameLower.includes('access') || subNameLower.includes('firewall') || subNameLower.includes('vpn') || subNameLower.includes('proxy') || subNameLower.includes('access')) {
                defaultActionOptions = [
                  'Request Access',
                  'Modify Permissions / Rules',
                  'Revoke Access / Disable Rule',
                  'Other'
                ];
              }

              fetchedFields.unshift({
                id: 'field-auto-action-req',
                fieldKey: 'actionRequired',
                fieldLabel: 'Action Required',
                fieldType: 'dropdown',
                isRequired: true,
                options: defaultActionOptions,
                appliesToActions: defaultActionOptions
              });
            }

            setFields(fetchedFields);

            setCustomFieldValues((prevCustomVals) => {
              const initialVals = initialData?.customFieldValues || {};
              const newCustomVals = { ...prevCustomVals };

              fetchedFields.forEach((f) => {
                let defaultVal = f.defaultValue;
                if (defaultVal === undefined || defaultVal === null || defaultVal === '') {
                  if (f.fieldType === 'dropdown') {
                    const opts = getFieldOptions(f, activeSessionUser);
                    defaultVal = opts.length > 0 ? opts[0] : '';
                  } else if (f.fieldType === 'boolean') {
                    defaultVal = false;
                  } else {
                    defaultVal = '';
                  }
                }

                if (initialVals[f.fieldKey] !== undefined) {
                  const existingVal = initialVals[f.fieldKey];
                  if (f.fieldType === 'dropdown') {
                    const opts = getFieldOptions(f, activeSessionUser);
                    const isValid = opts.includes(existingVal);
                    newCustomVals[f.fieldKey] = isValid ? existingVal : defaultVal;
                  } else {
                    newCustomVals[f.fieldKey] = existingVal;
                  }
                } else {
                  if (newCustomVals[f.fieldKey] === undefined || newCustomVals[f.fieldKey] === '') {
                    newCustomVals[f.fieldKey] = defaultVal;
                  }
                }
              });

              if (isOtherSubcat) {
                newCustomVals.actionRequired = 'Other';
              } else if (!newCustomVals.actionRequired) {
                const actionField = fetchedFields.find(f => f.fieldKey === 'actionRequired');
                if (actionField) {
                  const opts = getFieldOptions(actionField, activeSessionUser);
                  newCustomVals.actionRequired = opts[0] || 'Provision / Setup';
                }
              }

              if (initialVals.otherAction && !newCustomVals.otherAction) {
                newCustomVals.otherAction = initialVals.otherAction;
              }

              return newCustomVals;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch subcategory fields:', err);
      } finally {
        setFieldsLoading(false);
      }
    };
    fetchFields();
  }, [selectedSubcategoryId, selectedSubcategory, initialData, activeSessionUser?.isInUserTable]);

  const handleSubcategoryChange = (subId) => {
    setSelectedSubcategoryId(subId);
    const sub = subcategories.find((s) => s.id === subId);
    setSelectedSubcategory(sub || null);
    setCustomFieldValues({});
  };

  // Auto-generate title based on Action Required & Subcategory
  useEffect(() => {
    const actionRequiredVal = customFieldValues.actionRequired || '';
    if (!actionRequiredVal && !selectedSubcategory) return;

    const actionText = actionRequiredVal === 'Other'
      ? (customFieldValues.otherAction?.trim() || 'Other Action')
      : actionRequiredVal;

    let subName = selectedSubcategory?.name || '';
    if (subName === 'End Point Agent' || selectedSubcategory?.id === 'subcat-sec-ep') {
      subName = 'Endpoint Agent';
    }

    if (actionText && subName) {
      setFormData((prev) => ({
        ...prev,
        title: `${actionText} - ${subName}`
      }));
    } else if (subName) {
      setFormData((prev) => ({
        ...prev,
        title: `Change Request - ${subName}`
      }));
    }
  }, [selectedSubcategory, customFieldValues.actionRequired, customFieldValues.otherAction]);

  const handleCustomFieldChange = (key, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDetailsSubmit = (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!formData.managerName) {
      setErrorMessage('Please select a Reporting Manager.');
      return;
    }
    if (!formData.startDate) {
      setErrorMessage('Start Date is compulsory. Please select a start date.');
      return;
    }
    if (customFieldValues.actionRequired === 'Other' && !customFieldValues.otherAction?.trim()) {
      setErrorMessage('Please specify the details for the Other action option.');
      return;
    }
    if (!formData.justification?.trim()) {
      setErrorMessage('Please enter a Business Justification.');
      return;
    }

    setStep(3);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    const finalCustomValues = { ...customFieldValues };
    const currentAction = finalCustomValues.actionRequired || '';
    const otherAllowedKeys = ['actionRequired', 'description', 'purposeReason', 'purpose'];

    fields.forEach((f) => {
      const applies = currentAction === 'Other'
        ? otherAllowedKeys.includes(f.fieldKey)
        : (!f.appliesToActions || !Array.isArray(f.appliesToActions) || f.appliesToActions.includes(currentAction));
      if (applies && f.fieldType === 'dropdown') {
        const opts = getFieldOptions(f, activeSessionUser);
        if (!finalCustomValues[f.fieldKey] || !opts.includes(finalCustomValues[f.fieldKey])) {
          finalCustomValues[f.fieldKey] = opts[0] || '';
        }
      }
    });

    // Whitelist only valid fields belonging to the current subcategory & action
    const allowedFieldKeys = new Set(
      fields
        .filter((f) => {
          if (currentAction === 'Other') {
            return otherAllowedKeys.includes(f.fieldKey);
          }
          return !f.appliesToActions || !Array.isArray(f.appliesToActions) || f.appliesToActions.includes(currentAction);
        })
        .map((f) => f.fieldKey)
    );
    allowedFieldKeys.add('actionRequired');
    allowedFieldKeys.add('otherAction');

    const sanitizedCustomValues = {};
    for (const [k, v] of Object.entries(finalCustomValues)) {
      if (allowedFieldKeys.has(k)) {
        if (v !== '' && v !== null && v !== undefined) {
          sanitizedCustomValues[k] = v;
        }
      }
    }

    if (formData.managerName) {
      sanitizedCustomValues.managerName = formData.managerName;
    }

    const selectedCat = categories.find((c) => c.id === selectedCategoryId);
    const todayStr = new Date().toISOString().split('T')[0];

    const payload = {
      ...formData,
      startDate: formData.startDate || todayStr,
      category: selectedCat?.name || formData.category || 'Software Deployment',
      subCategory: selectedSubcategory?.name || formData.subCategory || '',
      subcategoryId: selectedSubcategoryId,
      actionRequired: finalCustomValues.actionRequired || '',
      customFieldValues: sanitizedCustomValues
    };

    try {
      const res = await apiFetch('/change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary-cards'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-expanded'] });
        queryClient.invalidateQueries({ queryKey: ['worklist'] });
        setCreatedCode(data.data?.requestCode || data.data?.id || '');
        setSubmitSuccess(true);
      } else {
        setErrorMessage(data.message || 'Failed to submit change request');
      }
    } catch (err) {
      console.warn('Backend API request failed:', err);
      setErrorMessage(err.message || 'Network error submitting change request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = ['Change Category', 'Request Details', 'Review & Submit'];

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  const actionRequiredValue = (customFieldValues.actionRequired || '').trim().toLowerCase();
  const OTHER_ACTION_ALLOWED_KEYS = ['actionrequired', 'description', 'purposereason', 'purpose'];
  const DUPLICATE_EXCLUDED_KEYS = ['replacementpurposereason', 'purposereason'];
  const visibleFields = fields.filter((f) => {
    const key = (f.fieldKey || '').toLowerCase();
    const label = (f.fieldLabel || '').toLowerCase();
    if (DUPLICATE_EXCLUDED_KEYS.includes(key) || label.includes('replacement purpose') || label === 'purpose / reason') {
      return false;
    }
    // Action Required field must ALWAYS be visible
    if (f.fieldKey === 'actionRequired' || key === 'actionrequired') {
      return true;
    }
    if (actionRequiredValue === 'other') {
      return OTHER_ACTION_ALLOWED_KEYS.includes(key);
    }
    if (!f.appliesToActions || !Array.isArray(f.appliesToActions) || f.appliesToActions.length === 0) return true;
    return f.appliesToActions.some(act => String(act).trim().toLowerCase() === actionRequiredValue);
  });

  return (
    <div className="flex w-full flex-col gap-5 pb-12">

      {/* Top Header */}
      <div>
        <h1 className="m-0 text-[1.45rem] font-bold leading-[1.2] text-foreground">
          New Change Request
        </h1>
        <p className="m-0 text-sm text-muted-foreground">
          Submit and track IT infrastructure, system, access, and asset change requests
        </p>
      </div>

      {/* Stepper Header */}
      <FormStepper steps={stepsList} currentStep={step} onStepClick={setStep} />

      {/* Success Banner */}
      {submitSuccess && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-8 py-10 text-center shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D1FAE5] text-[#059669]">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="m-0 text-xl font-bold text-[#065F46]">
            Change Request Submitted Successfully!
          </h3>
          <p className="m-0 max-w-[480px] text-[0.85rem] leading-normal text-[#047857]">
            Your change request <strong>{createdCode || ''}</strong> has been routed to Change Managers for review and authorization.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setSubmitSuccess(false);
                setCreatedCode('');
                setStep(1);
                setSelectedCategoryId('');
                setSelectedSubcategoryId('');
                setSelectedSubcategory(null);
                setFields([]);
                setCustomFieldValues({});
                setCertified(false);
                setErrorMessage('');
                const curr = activeSessionUser;
                setFormData({
                  title: '',
                  startDate: getTodayDateString(),
                  endDate: '',
                  justification: '',
                  employeeName: curr?.employee?.name || curr?.name || '',
                  employeeEmail: curr?.employee?.email || curr?.email || '',
                  employeeId: resolveEmpBusinessId(curr, ''),
                  location: resolveEmpLocation(curr, ''),
                  managerName: '',
                  managerEmail: ''
                });
              }}
              className="cursor-pointer rounded-lg border-none bg-[#047857] px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white"
            >
              Create Another Request
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

      {/* STEP 1: Select Change Category & Subcategory */}
      {!submitSuccess && step === 1 && (
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-foreground">
                1. Select Change Category
              </h3>
              <span className="text-[0.775rem] font-semibold text-muted-foreground">
                Step 1 of 3
              </span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {categories.map(cat => {
                const selected = selectedCategoryId === cat.id;
                const isHovered = hoveredCatId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryChange(cat.id)}
                    onMouseEnter={() => setHoveredCatId(cat.id)}
                    onMouseLeave={() => setHoveredCatId(null)}
                    className={`flex min-h-[92px] cursor-pointer flex-col justify-center rounded-xl p-[1.1rem] text-left transition-[transform,background-color,border-color,box-shadow] duration-200 ease ${
                      isHovered ? '-translate-y-[5px]' : 'translate-y-0'
                    } ${
                      selected
                        ? 'border-2 border-primary bg-input shadow-[0_0_0_3px_rgba(23,60,78,0.12)]'
                        : isHovered
                        ? 'border-[1.5px] border-primary bg-card shadow-[0_12px_24px_-4px_rgba(23,60,78,0.14),0_4px_12px_-2px_rgba(0,0,0,0.06)]'
                        : 'border border-border bg-card shadow-[0_1px_3px_rgba(16,21,30,0.04)]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-foreground">{cat.name}</div>
                    <div className="mt-1 text-[0.775rem] leading-[1.4] text-muted-foreground">
                      {CATEGORY_DESCRIPTIONS[cat.name] || (cat.subcategories?.length ? `${cat.subcategories.length} subcategories available` : '')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCategoryObj && (
            <div className="border-t border-border pt-5">
              <h3 className="m-0 mb-3 text-base font-semibold text-foreground">
                2. Select Subcategory for {selectedCategoryObj.name}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[0.6rem]">
                {subcategories.map(sub => {
                  const selected = selectedSubcategoryId === sub.id;
                  const isHovered = hoveredSubId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSubcategoryChange(sub.id)}
                      onMouseEnter={() => setHoveredSubId(sub.id)}
                      onMouseLeave={() => setHoveredSubId(null)}
                      className={`cursor-pointer rounded-lg bg-transparent px-[0.95rem] py-3 text-left text-[0.825rem] text-foreground transition-[transform,border-color,box-shadow] duration-[180ms] ease ${
                        selected ? 'font-semibold' : 'font-medium'
                      } ${isHovered ? '-translate-y-[3px]' : 'translate-y-0'} ${
                        selected
                          ? 'border-2 border-primary shadow-[0_0_0_3px_rgba(23,60,78,0.12)]'
                          : isHovered
                          ? 'border-[1.5px] border-primary shadow-[0_6px_14px_-2px_rgba(23,60,78,0.12)]'
                          : 'border border-border shadow-none'
                      }`}
                    >
                      {sub.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="button"
              disabled={!selectedCategoryId || !selectedSubcategoryId}
              onClick={() => setStep(2)}
              className={`inline-flex items-center gap-[0.45rem] rounded-lg border-none bg-primary px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-white ${
                (!selectedCategoryId || !selectedSubcategoryId) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <span>Next: Request Details</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Fill in Request Details */}
      {!submitSuccess && step === 2 && (
        <form onSubmit={handleDetailsSubmit} className="flex flex-col gap-7 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
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
                  value={formData.employeeName}
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
                  value={formData.employeeEmail}
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
                  value={formData.employeeId}
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
                  value={formData.location || resolveEmpLocation(activeSessionUser) || ''}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
              {/* Searchable Manager Combobox Dropdown */}
              <ManagerCombobox
                managerName={formData.managerName}
                managerEmail={formData.managerEmail}
                onSelect={(u) => setFormData(prev => ({ ...prev, managerName: u.name, managerEmail: u.email || '' }))}
                users={availableUsers}
                loading={loadingUsers}
                excludeEmail={activeSessionUser?.employee?.email || activeSessionUser?.email || ''}
              />

              {/* Manager Email */}
              <div>
                <FormLabel>Manager Email</FormLabel>
                <input
                  type="email"
                  readOnly
                  disabled
                  value={formData.managerEmail || ''}
                  className={READONLY_FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          {/* Section Divider Line */}
          <div className="w-full border-t border-border" />

          {/* Section 2: Change Details */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-base font-semibold text-foreground">
                Change Details
              </h3>
              <span className="text-[0.775rem] font-semibold text-muted-foreground">
                Section 2 of 2
              </span>
            </div>

            <div className="cd-responsive-form-grid">
              {/* Change Title */}
              <div>
                <FormLabel>Change Title</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  placeholder="Auto-generated from action and sub-category"
                  value={formData.title}
                  className={READONLY_FIELD_CLASS}
                />
              </div>

              {/* Category */}
              <div>
                <FormLabel>Category</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={selectedCategoryObj?.name || formData.category || 'Server & Infra'}
                  className={READONLY_FIELD_CLASS}
                />
              </div>

              {/* Sub-category */}
              <div>
                <FormLabel>Sub-category</FormLabel>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={selectedSubcategory?.name || formData.subCategory || 'Server Lifecycle'}
                  className={READONLY_FIELD_CLASS}
                />
              </div>

              {/* Start Date */}
              <div>
                <FormLabel required>Start Date</FormLabel>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className={ACTIVE_FIELD_CLASS}
                />
              </div>

              {/* Dynamic Fields */}
              {visibleFields.length > 0 && (
                <div className="col-span-full flex flex-col gap-4 rounded-[10px] border border-border bg-card p-4">
                  <div className="cd-responsive-form-grid !gap-4">
                    {visibleFields.map((field) => {
                      const isOtherSubcat =
                        selectedSubcategoryId === 'subcat-srv-oth' ||
                        selectedSubcategoryId === 'subcat-net-oth' ||
                        selectedSubcategoryId === 'subcat-acc-oth' ||
                        selectedSubcategoryId === 'subcat-asset-oth' ||
                        selectedSubcategoryId === 'subcat-o365-oth' ||
                        selectedSubcategoryId === 'subcat-sec-oth';
                      const isActionRequiredOther = field.fieldKey === 'actionRequired' && (isOtherSubcat || customFieldValues.actionRequired === 'Other');

                      if (isActionRequiredOther) {
                        const isDisabled = fieldsLoading && field.fieldKey === 'actionRequired';
                        return (
                          <div key={field.id || field.fieldKey} className="cd-form-span-2 cd-responsive-inner-grid">
                            <div>
                              <FormLabel required={Boolean(field.isRequired) || isOtherSubcat}>
                                {field.fieldLabel || 'Action Required'}
                              </FormLabel>
                              {isOtherSubcat ? (
                                <input
                                  type="text"
                                  disabled
                                  value="Other"
                                  className={READONLY_FIELD_CLASS}
                                />
                              ) : (
                                <select
                                  disabled={isDisabled}
                                  value={customFieldValues[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  className={isDisabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                                >
                                  {isDisabled ? (
                                    <option value="">Loading options...</option>
                                  ) : (
                                    getFieldOptions(field, activeSessionUser).map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))
                                  )}
                                </select>
                              )}
                            </div>

                            <div>
                              <FormLabel required>Specify Other Action</FormLabel>
                              <input
                                type="text"
                                required
                                placeholder="Enter custom action..."
                                value={customFieldValues.otherAction || ''}
                                onChange={(e) => handleCustomFieldChange('otherAction', e.target.value)}
                                className={ACTIVE_FIELD_CLASS}
                              />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={field.id || field.fieldKey}>
                          <FormLabel required={Boolean(field.isRequired)}>
                            {field.fieldLabel}
                          </FormLabel>
                          {(() => {
                            if (field.fieldType === 'dropdown') {
                              const isDisabled = fieldsLoading && field.fieldKey === 'actionRequired';
                              return (
                                <select
                                  disabled={isDisabled}
                                  value={customFieldValues[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  className={isDisabled ? READONLY_FIELD_CLASS : ACTIVE_FIELD_CLASS}
                                >
                                  {isDisabled ? (
                                    <option value="">Loading options...</option>
                                  ) : (
                                    getFieldOptions(field, activeSessionUser).map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))
                                  )}
                                </select>
                              );
                            }

                            if (field.fieldType === 'boolean') {
                              return (
                                <label className="mt-2 inline-flex cursor-pointer items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(customFieldValues[field.fieldKey])}
                                    onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.checked)}
                                  />
                                  <span className="text-[0.85rem] text-foreground">Enable / Yes</span>
                                </label>
                              );
                            }

                            if (field.fieldType === 'date') {
                              return (
                                <input
                                  type="date"
                                  value={customFieldValues[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  className={ACTIVE_FIELD_CLASS}
                                />
                              );
                            }

                            if (field.fieldType === 'textarea') {
                              return (
                                <textarea
                                  rows={3}
                                  placeholder={`Enter ${field.fieldLabel}`}
                                  value={customFieldValues[field.fieldKey] || ''}
                                  onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                  className={`${ACTIVE_FIELD_CLASS} resize-y`}
                                />
                              );
                            }

                            const cleanLabel = field.fieldLabel || '';
                            const placeholderText = cleanLabel.toLowerCase().includes('cve')
                              ? 'Enter KB/CVE (if applicable)'
                              : cleanLabel.toLowerCase().includes('current os')
                              ? 'Enter current OS/Version'
                              : cleanLabel.toLowerCase().includes('target version')
                              ? 'Enter target Version/Patch'
                              : cleanLabel.toLowerCase().includes('ip address')
                              ? 'Enter IP address'
                              : `Enter ${cleanLabel}`;

                            return (
                              <input
                                type="text"
                                placeholder={placeholderText}
                                value={customFieldValues[field.fieldKey] || ''}
                                onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                                className={ACTIVE_FIELD_CLASS}
                              />
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Business justification */}
              <div className="col-span-full">
                <FormLabel required>Business Justification</FormLabel>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter business justification"
                  value={formData.justification}
                  onChange={(e) => handleInputChange('justification', e.target.value)}
                  className={`${ACTIVE_FIELD_CLASS} resize-y`}
                />
              </div>
            </div>
          </div>

          {/* Warning banner above Back and Next buttons */}
          {errorMessage && (
            <div className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-[0.85rem] font-semibold text-[#DC2626]">
              {errorMessage}
            </div>
          )}

          {/* Step 2 Action Buttons */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex cursor-pointer items-center gap-[0.45rem] rounded-lg border border-border bg-card px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-foreground"
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
      {!submitSuccess && step === 3 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-xl border border-border bg-card p-7 shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
          {/* Header Row with Edit details Action */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-semibold text-foreground">
                Review &amp; Submit Change Request
              </h2>
              <p className="m-0 text-sm text-muted-foreground">
                Confirm the details before submitting for approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex cursor-pointer items-center gap-[0.35rem] border-none bg-none text-sm font-semibold text-info"
            >
              <Edit3 size={14} />
              <span>Edit Details</span>
            </button>
          </div>

          {/* Section 1: Requester Profile */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-card px-5 py-3 text-[0.85rem] font-semibold text-foreground">
              1. Requester Profile &amp; Approver
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 p-5 text-[0.85rem]">
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Requester</span>
                <span className="font-semibold text-foreground">{formData.employeeName || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Email</span>
                <span className="font-semibold text-foreground">{formData.employeeEmail || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Employee ID</span>
                <span className="font-semibold text-foreground">{formData.employeeId || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Location</span>
                <span className="font-semibold text-foreground">{formData.location || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Reporting Manager</span>
                <span className="font-semibold text-foreground">{formData.managerName || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Manager Email</span>
                <span className="font-semibold text-foreground">{formData.managerEmail || '—'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Change Specifications */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-card px-5 py-3 text-[0.85rem] font-semibold text-foreground">
              2. Change Details &amp; Justification
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 p-5 text-[0.85rem]">
              <div className="col-span-full">
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Change Title</span>
                <span className="text-[0.95rem] font-bold text-foreground">{formData.title || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Category</span>
                <span className="font-semibold text-foreground">{selectedCategoryObj?.name || formData.category || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Sub-category</span>
                <span className="font-semibold text-foreground">{selectedSubcategory?.name || formData.subCategory || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Target Start Date</span>
                <span className="font-semibold text-foreground">{formData.startDate || '—'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Action Required</span>
                <span className="font-semibold text-foreground">
                  {customFieldValues.actionRequired === 'Other' ? (customFieldValues.otherAction || 'Other') : (customFieldValues.actionRequired || '—')}
                </span>
              </div>

              {/* Dynamic field items summary */}
              {visibleFields.filter(f => f.fieldKey !== 'actionRequired').map(field => {
                const val = customFieldValues[field.fieldKey];
                if (val === undefined || val === null || val === '') return null;
                const displayVal = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                return (
                  <div key={field.fieldKey}>
                    <span className="block text-xs font-semibold uppercase text-muted-foreground">{field.fieldLabel}</span>
                    <span className="font-semibold text-foreground">{displayVal}</span>
                  </div>
                );
              })}

              <div className="col-span-full border-t border-dashed border-border pt-2">
                <span className="block text-xs font-semibold uppercase text-muted-foreground">Business Justification</span>
                <p className="m-0 mt-1 whitespace-pre-wrap leading-normal text-foreground">{formData.justification || '—'}</p>
              </div>
            </div>
          </div>

          {/* Compliance Checkbox */}
          <div className="flex flex-col gap-2 border-y border-border py-4">
            <div className="flex items-center gap-3">
              <input
                id="certify-change"
                type="checkbox"
                required
                checked={certified}
                onChange={e => setCertified(e.target.checked)}
                className="h-[18px] w-[18px] cursor-pointer accent-primary"
              />
              <label htmlFor="certify-change" className="cursor-pointer text-sm font-medium leading-[1.45] text-foreground">
                I confirm that the change information provided is accurate and complies with the IT change management governance policy.
              </label>
            </div>
          </div>

          {/* Warning banner above Back and Submit buttons */}
          {errorMessage && (
            <div className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-[0.85rem] font-semibold text-[#DC2626]">
              {errorMessage}
            </div>
          )}

          {/* Submit Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={isSubmitting}
              className={`inline-flex items-center gap-[0.45rem] rounded-lg border border-border bg-card px-[1.35rem] py-[0.65rem] text-[0.85rem] font-semibold text-foreground ${isSubmitting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              type="submit"
              disabled={!certified || isSubmitting}
              className={`inline-flex items-center gap-2 rounded-lg border-none bg-primary px-7 py-3 text-[0.9rem] font-semibold text-white ${
                (!certified || isSubmitting) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'
              }`}
            >
              <Send size={15} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Change Request'}</span>
            </button>
          </div>
        </form>
      )}

    </div>
  );
}

export default React.memo(ChangeRequestFormPage);
