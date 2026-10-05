import { CatalogCategory, CatalogSubcategory, CatalogSubcategoryField } from '../models/index.js';
import { addAuditLog } from './auditLog.service.js';
import { resolveEmailForUser, IdentityResolver } from './identityResolver.service.js';

const SUBCATEGORY_ORDER_MAP = {
  // 1. Server & Infra
  'subcat-srv-lc': 1,
  'subcat-srv-patch': 2,
  'subcat-srv-oth': 3,

  // 2. Network & Connectivity
  'subcat-net-fw': 1,
  'subcat-net-proxy': 2,
  'subcat-net-vpn': 3,
  'subcat-net-oth': 4,

  // 3. Access & Security
  'subcat-acc-app': 1,
  'subcat-acc-phys': 2,
  'subcat-acc-oth': 3,

  // 4. IT Asset
  'subcat-asset-dev': 1,
  'subcat-asset-hw': 2,
  'subcat-asset-sw': 3,
  'subcat-asset-lic': 4,
  'subcat-asset-oth': 5,

  // 5. Office 365 & Collaboration
  'subcat-o365-mb': 1,
  'subcat-o365-lic': 2,
  'subcat-o365-oth': 3,

  // 6. Security Tools & Policies
  'subcat-sec-ep': 1,
  'subcat-sec-oth': 2
};

const CATEGORY_ORDER_MAP = {
  'cat-asset': 1, // IT Asset
  'cat-o365': 2,  // Office 365 & Collaboration
  'cat-acc': 3,   // Access & Security
  'cat-net': 4,   // Network & Connectivity
  'cat-sec': 5,   // Security Tools & Policies
  'cat-srv': 6    // Server & Infra
};

export const getCatalogCategoriesService = async () => {
  const rows = await CatalogCategory.findAll({
    include: [
      {
        model: CatalogSubcategory,
        as: 'subcategories',
        where: { status: 'Active' },
        required: false,
        attributes: ['id', 'categoryId', 'name', 'status']
      }
    ]
  });

  const OTHER_NAME_MAP = {
    'cat-srv': 'Other Server Changes',
    'cat-net': 'Other Network Changes',
    'cat-acc': 'Other Access Requests',
    'cat-asset': 'Other IT Asset Requests',
    'cat-o365': 'Other Email / M365 Requests',
    'cat-sec': 'Other Security Changes',
    'subcat-srv-oth': 'Other Server Changes',
    'subcat-net-oth': 'Other Network Changes',
    'subcat-acc-oth': 'Other Access Requests',
    'subcat-asset-oth': 'Other IT Asset Requests',
    'subcat-o365-oth': 'Other Email / M365 Requests',
    'subcat-sec-oth': 'Other Security Changes'
  };

  const categories = rows.map((c) => {
    const plain = c.get({ plain: true });
    if (plain.subcategories && Array.isArray(plain.subcategories)) {
      plain.subcategories.forEach((sub) => {
        delete sub.workflowId;
        delete sub.workflow;
        delete sub.risk;
        if (sub.id === 'subcat-sec-ep' || sub.name === 'End Point Agent') {
          sub.name = 'Endpoint Agent';
        }
        if ((sub.name || '').toLowerCase() === 'other' || sub.name === 'Other') {
          sub.name = OTHER_NAME_MAP[sub.id] || OTHER_NAME_MAP[sub.categoryId] || OTHER_NAME_MAP[c.id] || 'Other Request';
          sub.description = `Other ${c.name || ''} change request.`.replace('Other Other', 'Other');
        }
      });
      plain.subcategories.sort((a, b) => {
        const orderA = SUBCATEGORY_ORDER_MAP[a.id] ?? 99;
        const orderB = SUBCATEGORY_ORDER_MAP[b.id] ?? 99;
        return orderA - orderB;
      });
    }
    return plain;
  });

  categories.sort((a, b) => {
    const orderA = CATEGORY_ORDER_MAP[a.id] ?? 99;
    const orderB = CATEGORY_ORDER_MAP[b.id] ?? 99;
    return orderA - orderB;
  });

  return categories;
};

export const getSubcategoryFieldsService = async (subcategoryId) => {
  const rows = await CatalogSubcategoryField.findAll({
    where: { subcategoryId },
    order: [['sortOrder', 'ASC']]
  });
  const list = rows
    .filter((f) => {
      const label = (f.fieldLabel || '').trim().toLowerCase();
      const key = (f.fieldKey || '').trim().toLowerCase();
      const isDuplicateReason =
        label === 'purpose / reason' ||
        label === 'purpose/reason' ||
        label === 'replacement purpose / reason' ||
        label === 'replacement purpose/reason' ||
        key === 'purposereason' ||
        key === 'replacementpurposereason' ||
        f.id === 'f-dev-replreason';

      // Filtered out of the response only — deleting rows belongs in a migration,
      // not in the read path that serves this catalog to every requester.
      return !isDuplicateReason;
    })
    .map((f) => {
      const plain = f.get({ plain: true });
    let dbNeedsUpdate = false;
    if (plain.fieldLabel && (plain.fieldLabel.toLowerCase() === 'current configuration' || plain.fieldLabel.includes('Congfig') || plain.fieldLabel.includes('figuraiton') || plain.fieldLabel.toLowerCase().includes('congfig'))) {
      plain.fieldLabel = 'Current Configuration';
      dbNeedsUpdate = true;
    }
    if (plain.fieldLabel && plain.fieldLabel.includes('Proess')) {
      plain.fieldLabel = plain.fieldLabel.replace('Proess', 'Process');
      dbNeedsUpdate = true;
    }
    if (plain.options && Array.isArray(plain.options)) {
      const fixedOpts = plain.options.map(opt => (typeof opt === 'string' ? opt.replace(/Exisitng/g, 'Existing') : opt));
      if (JSON.stringify(fixedOpts) !== JSON.stringify(plain.options)) {
        plain.options = fixedOpts;
        dbNeedsUpdate = true;
      }
    }
    if (plain.appliesToActions && Array.isArray(plain.appliesToActions)) {
      const fixedActs = plain.appliesToActions.map(act => (typeof act === 'string' ? act.replace(/Exisitng/g, 'Existing') : act));
      if (JSON.stringify(fixedActs) !== JSON.stringify(plain.appliesToActions)) {
        plain.appliesToActions = fixedActs;
        dbNeedsUpdate = true;
      }
    }
    if (plain.id === 'f-hw-assetid' || (subcategoryId === 'subcat-asset-hw' && plain.fieldKey === 'assetId')) {
      if (!Array.isArray(plain.appliesToActions) || !plain.appliesToActions.includes('Return IT Asset')) {
        const current = Array.isArray(plain.appliesToActions) ? [...plain.appliesToActions] : ['Repair Request', 'Dispose Request'];
        if (!current.includes('Return IT Asset')) current.unshift('Return IT Asset');
        plain.appliesToActions = current;
        dbNeedsUpdate = true;
      }
    }
    if (subcategoryId === 'subcat-srv-lc' && plain.fieldKey === 'actionRequired') {
      if (Array.isArray(plain.options)) {
        const updatedOpts = plain.options.map(opt => (opt === 'Create a New Server' || opt === 'Create a Server' ? 'Deploy a Server' : opt));
        if (!updatedOpts.includes('Deploy a Server')) updatedOpts.unshift('Deploy a Server');
        plain.options = updatedOpts;
        dbNeedsUpdate = true;
      }
    }
    if (subcategoryId === 'subcat-srv-lc' && plain.fieldKey === 'hostingType') {
      const targetActs = ['Deploy a Server', 'Change / Modify an Existing Server'];
      if (JSON.stringify(plain.appliesToActions) !== JSON.stringify(targetActs)) {
        plain.appliesToActions = targetActs;
        dbNeedsUpdate = true;
      }
    }
    if (subcategoryId === 'subcat-srv-lc' && Array.isArray(plain.appliesToActions) && plain.fieldKey !== 'hostingType') {
      const updatedActs = plain.appliesToActions.map(act => (act === 'Create a New Server' || act === 'Create a Server' ? 'Deploy a Server' : act));
      if (JSON.stringify(updatedActs) !== JSON.stringify(plain.appliesToActions)) {
        plain.appliesToActions = updatedActs;
        dbNeedsUpdate = true;
      }
    }
    // Corrections above are applied to the response object only; persisting them is a
    // migration's job, not something a GET should do as a side effect on every call.
    void dbNeedsUpdate;
    return plain;
  });

  if (subcategoryId === 'subcat-srv-lc') {
    // 1. Ensure sourceHosting exists
    if (!list.some(f => f.fieldKey === 'sourceHosting')) {
      const field = await CatalogSubcategoryField.findOrCreate({
        where: { id: 'f-srv-srchosting' },
        defaults: {
          id: 'f-srv-srchosting',
          subcategoryId: 'subcat-srv-lc',
          fieldKey: 'sourceHosting',
          fieldLabel: 'Source Hosting',
          fieldType: 'dropdown',
          isRequired: true,
          sortOrder: 3,
          appliesToActions: ['Migrate a Server'],
          options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise']
        }
      });
      list.push(field[0].get({ plain: true }));
    }
    // 2. Ensure destination exists
    if (!list.some(f => f.fieldKey === 'destination')) {
      const field = await CatalogSubcategoryField.findOrCreate({
        where: { id: 'f-srv-desthosting' },
        defaults: {
          id: 'f-srv-desthosting',
          subcategoryId: 'subcat-srv-lc',
          fieldKey: 'destination',
          fieldLabel: 'Destination',
          fieldType: 'dropdown',
          isRequired: true,
          sortOrder: 4,
          appliesToActions: ['Migrate a Server'],
          options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise']
        }
      });
      list.push(field[0].get({ plain: true }));
    }
    // 3. Ensure hostingServer exists
    if (!list.some(f => f.fieldKey === 'hostingServer')) {
      const field = await CatalogSubcategoryField.findOrCreate({
        where: { id: 'f-srv-hostingserver' },
        defaults: {
          id: 'f-srv-hostingserver',
          subcategoryId: 'subcat-srv-lc',
          fieldKey: 'hostingServer',
          fieldLabel: 'Hosting Server',
          fieldType: 'dropdown',
          isRequired: true,
          sortOrder: 5,
          appliesToActions: ['Decommission a Server'],
          options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise']
        }
      });
      list.push(field[0].get({ plain: true }));
    }

    // Sort Migrate a Server fields in the exact order requested: Server Name, IP Address, Source Hosting, Destination
    const MIGRATE_ORDER_MAP = {
      actionRequired: 0,
      serverName: 1,
      ipAddress: 2,
      sourceHosting: 3,
      destination: 4,
      hostingServer: 5,
      purpose: 6,
      hostingType: 7,
      operatingSystem: 8,
      cpu: 9,
      ram: 10,
      storage: 11,
      vlanRequirement: 12,
      backupRequired: 13
    };
    list.sort((a, b) => (MIGRATE_ORDER_MAP[a.fieldKey] ?? 99) - (MIGRATE_ORDER_MAP[b.fieldKey] ?? 99));
  }

  if (subcategoryId === 'subcat-net-fw' && !list.some(f => f.fieldKey === 'existingFirewall')) {
    const existingField = await CatalogSubcategoryField.findOrCreate({
      where: { id: 'f-fw-existing' },
      defaults: {
        id: 'f-fw-existing',
        subcategoryId: 'subcat-net-fw',
        fieldKey: 'existingFirewall',
        fieldLabel: 'Existing Firewall',
        fieldType: 'text',
        isRequired: true,
        sortOrder: 1,
        appliesToActions: ['Modify Existing Firewall Rule'],
        options: null
      }
    });
    list.splice(1, 0, existingField[0].get({ plain: true }));
  }

  if (subcategoryId === 'subcat-asset-dev') {
    const defaultDevFields = [
      { id: 'f-dev-act', subcategoryId: 'subcat-asset-dev', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request for Procurement of Laptop / Desktop', 'Replace Existing Laptop / Desktop', 'Repair Request', 'Dispose Request', 'Other'] },
      { id: 'f-dev-assettype', subcategoryId: 'subcat-asset-dev', fieldKey: 'assetType', fieldLabel: 'Asset Type', fieldType: 'dropdown', isRequired: true, sortOrder: 1, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: ['Laptop', 'Desktop', 'Workstation'] },
      { id: 'f-dev-reqcfg', subcategoryId: 'subcat-asset-dev', fieldKey: 'requestedConfiguration', fieldLabel: 'Requested Configuration', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Request for Procurement of Laptop / Desktop', 'Replace Existing Laptop / Desktop'], options: null },
      { id: 'f-dev-qty', subcategoryId: 'subcat-asset-dev', fieldKey: 'qtyRequired', fieldLabel: 'Qty Required', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
      { id: 'f-dev-loc', subcategoryId: 'subcat-asset-dev', fieldKey: 'location', fieldLabel: 'Location', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
      { id: 'f-dev-stock', subcategoryId: 'subcat-asset-dev', fieldKey: 'currentQtyInStock', fieldLabel: 'Current Qty in Stock', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
      { id: 'f-dev-curcfg', subcategoryId: 'subcat-asset-dev', fieldKey: 'currentConfiguration', fieldLabel: 'Current Configuration', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Replace Existing Laptop / Desktop'], options: null },
      { id: 'f-dev-assetid', subcategoryId: 'subcat-asset-dev', fieldKey: 'existingAssetId', fieldLabel: 'Existing Asset ID', fieldType: 'text', isRequired: true, sortOrder: 8, appliesToActions: ['Replace Existing Laptop / Desktop', 'Repair Request', 'Dispose Request'], options: null },
      { id: 'f-dev-repairreason', subcategoryId: 'subcat-asset-dev', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 9, appliesToActions: ['Repair Request'], options: null },
      { id: 'f-dev-purchdate', subcategoryId: 'subcat-asset-dev', fieldKey: 'dateOfPurchase', fieldLabel: 'Date of Purchase', fieldType: 'text', isRequired: true, sortOrder: 10, appliesToActions: ['Dispose Request'], options: null },
      { id: 'f-dev-dispreason', subcategoryId: 'subcat-asset-dev', fieldKey: 'disposalReason', fieldLabel: 'Disposal Reason', fieldType: 'text', isRequired: true, sortOrder: 11, appliesToActions: ['Dispose Request'], options: null }
    ];

    for (const defField of defaultDevFields) {
      const idx = list.findIndex(f => f.fieldKey === defField.fieldKey);
      if (idx === -1) {
        list.push(defField);
      } else {
        // Ensure appliesToActions and options are correctly synced
        if (defField.appliesToActions) {
          list[idx].appliesToActions = defField.appliesToActions;
        }
        if (defField.options) {
          list[idx].options = defField.options;
        }
        list[idx].fieldLabel = defField.fieldLabel;
      }
    }
  }

  return list;
};

export const createCatalogSubcategoryService = async (payload = {}) => {
  const { categoryId, name, sla, risk, workflowId, description, actor } = payload;

  if (!categoryId || !name) {
    throw new Error('categoryId and name are required');
  }

  const existingCount = await CatalogSubcategory.count({ where: { categoryId } });
  const cleanCatSlug = categoryId.replace(/^cat-/, '');
  const subcatId = `subcat-${cleanCatSlug}-${existingCount + 1}`;

  const subcategory = await CatalogSubcategory.create({
    id: subcatId,
    categoryId,
    name,
    description: description || `${name} change request.`,
    status: 'Active'
  });

  await CatalogSubcategoryField.bulkCreate([
    {
      id: `field-${subcatId}-action`,
      subcategoryId: subcatId,
      fieldKey: 'actionRequired',
      fieldLabel: 'Action Required',
      fieldType: 'dropdown',
      isRequired: true,
      sortOrder: 1,
      options: ['Create / Provision', 'Modify / Update', 'Decommission / Revoke', 'Other']
    },
    {
      id: `field-${subcatId}-target`,
      subcategoryId: subcatId,
      fieldKey: 'targetHostname',
      fieldLabel: 'Target Hostname / Asset',
      fieldType: 'text',
      isRequired: true,
      sortOrder: 2
    },
    {
      id: `field-${subcatId}-notes`,
      subcategoryId: subcatId,
      fieldKey: 'changeNotes',
      fieldLabel: 'Specific Notes / Details',
      fieldType: 'text',
      isRequired: false,
      sortOrder: 3
    }
  ]);

  let resolvedActorId = null;
  if (actor) {
    if (typeof actor === 'string' && (actor.startsWith('S8-') || actor.startsWith('EMP-'))) {
      resolvedActorId = actor;
    } else {
      const idRes = await IdentityResolver.resolveByEmail(actor);
      if (idRes.status === 'SUCCESS') resolvedActorId = idRes.identity.userKey;
    }
  }

  await addAuditLog({
    actorId: resolvedActorId || 'SYSTEM',
    action: 'Subcategory Created',
    ref: subcatId,
    detail: `Added new sub-category ${name} under category ${categoryId}.`
  });

  return subcategory.get({ plain: true });
};
