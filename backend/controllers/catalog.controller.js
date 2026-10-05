import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getCatalogCategoriesService,
  getSubcategoryFieldsService,
  createCatalogSubcategoryService
} from '../services/dashboard.service.js';

export const getCatalog = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getCatalogCategoriesService() });
});

export const getCatalogCategories = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getCatalogCategoriesService() });
});

export const getSubcategoryFields = asyncHandler(async (req, res) => {
  const { id } = req.params;
  res.json({ success: true, data: await getSubcategoryFieldsService(id) });
});

export const createCatalogSubcategory = asyncHandler(async (req, res) => {
  const { categoryId, name, sla, risk, workflowId, description } = req.body || {};
  if (!categoryId || !name) {
    return res.status(400).json({ success: false, message: 'categoryId and name are required' });
  }

  const subcategory = await createCatalogSubcategoryService({
    categoryId,
    name,
    sla,
    risk,
    workflowId,
    description,
    actor: req.user?.name
  });

  res.status(201).json({ success: true, message: 'Sub-category created successfully', data: subcategory });
});
