import PDFDocument from 'pdfkit';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getSettingsUsersService,
  createSettingsUserService,
  updateSettingsUserService,
  deleteSettingsUserService,
  getSettingsRolesService,
  updateRolePermissionsService,
  getSettingsAuditLogsService,
  getChangeManagerCategoriesService,
  updateChangeManagerCategoriesService,
  getChangeImplementerCategoriesService,
  updateChangeImplementerCategoriesService
} from '../services/dashboard.service.js';

export const getSettingsUsers = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getSettingsUsersService() });
});

export const createSettingsUser = asyncHandler(async (req, res) => {
  const user = await createSettingsUserService(req.body || {}, {
    actorId: req.user?.id,
    actorRoleId: req.user?.roleId,
    invitedByName: req.user?.name
  });
  res.status(201).json({ success: true, message: 'User invited — a sign-in email has been sent', data: user });
});

export const updateSettingsUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await updateSettingsUserService(id, req.body || {}, {
    actorId: req.user?.id,
    actorRoleId: req.user?.roleId
  });
  res.json({ success: true, message: 'User updated successfully', data: user });
});

export const deleteSettingsUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await deleteSettingsUserService(id, {
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    actorRoleId: req.user?.roleId
  });
  res.json({ success: true, message: 'User deactivated and roles removed successfully', data: result });
});

export const getSettingsRoles = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getSettingsRolesService() });
});

export const updateRolePermissions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permissions = [] } = req.body || {};
  const role = await updateRolePermissionsService(id, permissions);
  res.json({ success: true, message: 'Role permissions updated successfully', data: role });
});

export const getSettingsAuditLogs = asyncHandler(async (req, res) => {
  const result = await getSettingsAuditLogsService(req.query.filter || 'All activity', {
    page: req.query.page,
    limit: req.query.limit
  });
  res.json({ success: true, ...result });
});

export const exportAuditLogs = asyncHandler(async (req, res) => {
  const format = (req.body?.format || req.query?.format || 'excel').toLowerCase();
  const filter = req.body?.filter || req.query?.filter || 'All activity';

  const logs = await getSettingsAuditLogsService(filter, { all: true });

  if (format === 'excel' || format === 'xlsx' || format === 'csv') {
    const headers = ['Log ID', 'Timestamp', 'Actor', 'Action', 'Reference', 'Employee Email', 'Category'];
    const rows = logs.map(l => [
      `"${l.id}"`,
      `"${l.timestamp || ''}"`,
      `"${(l.actor || '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`,
      `"${(l.action || '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`,
      `"${(l.reference || '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`,
      `"${(l.employeeEmail || '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`,
      `"${(l.category || '').replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs_report.csv"');
    return res.send(csvContent);
  }

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs_report.pdf"');

    const PDFDoc = PDFDocument.default || PDFDocument;
    const doc = new PDFDoc({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Title & Header
    doc.fontSize(18).fillColor('#0F172A').text('System Audit Logs Report', { align: 'left' });
    doc.fontSize(9).fillColor('#64748B').text(`Filter: ${filter}  |  Generated on ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown(1.5);

    // Table Header
    const tableTop = doc.y;
    doc.fontSize(9).fillColor('#475569');
    doc.text('Timestamp', 40, tableTop, { width: 120 });
    doc.text('Actor', 160, tableTop, { width: 110 });
    doc.text('Action', 270, tableTop, { width: 110 });
    doc.text('Reference', 380, tableTop, { width: 80 });
    doc.text('Email', 460, tableTop, { width: 95 });

    doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).strokeColor('#CBD5E1').stroke();

    let currentY = tableTop + 20;
    logs.forEach((l) => {
      if (currentY > 750) {
        doc.addPage();
        currentY = 40;
      }
      doc.fontSize(8.5).fillColor('#1E293B');
      doc.text(String(l.timestamp || ''), 40, currentY, { width: 115 });
      doc.text(String(l.actor || '').substring(0, 18), 160, currentY, { width: 105 });
      doc.text(String(l.action || '').substring(0, 18), 270, currentY, { width: 105 });
      doc.text(String(l.reference || ''), 380, currentY, { width: 75 });
      doc.text(String(l.employeeEmail || '').substring(0, 16), 460, currentY, { width: 95 });
      currentY += 16;
    });

    doc.end();
    return;
  }

  res.json({ success: true, message: `Audit logs exported as ${format.toUpperCase()}` });
});

export const getChangeManagerCategories = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const data = await getChangeManagerCategoriesService(userId);
  res.json({ success: true, count: data.length, data });
});

export const updateChangeManagerCategories = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { categoryIds } = req.body;
  const data = await updateChangeManagerCategoriesService(userId, categoryIds || []);
  res.json({ success: true, message: 'Change manager categories updated successfully', data });
});

export const getChangeImplementerCategories = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const data = await getChangeImplementerCategoriesService(userId);
  res.json({ success: true, count: data.length, data });
});

export const updateChangeImplementerCategories = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { categoryIds } = req.body;
  const data = await updateChangeImplementerCategoriesService(userId, categoryIds || []);
  res.json({ success: true, message: 'Change implementer categories updated successfully', data });
});
