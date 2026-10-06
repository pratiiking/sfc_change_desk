import express from 'express';
import {
  getCatalog,
  getCatalogCategories,
  getSubcategoryFields,
  createCatalogSubcategory
} from '../controllers/catalog.controller.js';
import { requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/catalog', getCatalog);
router.get('/catalog/categories', getCatalogCategories);
router.post('/catalog/subcategories', requirePermission('catalog.subcategory.manage'), createCatalogSubcategory);
router.get('/catalog/subcategories/:id/fields', getSubcategoryFields);

export default router;
