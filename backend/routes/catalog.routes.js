import express from 'express';
import {
  getCatalog,
  getCatalogCategories,
  getSubcategoryFields,
  createCatalogSubcategory
} from '../controllers/catalog.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { ROLE } from '../config/constants.js';

const router = express.Router();

router.get('/catalog', getCatalog);
router.get('/catalog/categories', getCatalogCategories);
router.post('/catalog/subcategories', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), createCatalogSubcategory);
router.get('/catalog/subcategories/:id/fields', getSubcategoryFields);

export default router;
