-- Each department becomes two workspace techniques (QC + maintenance) so ticket
-- creation lists route to department staff via PrivateCompanyTechnique + departmentId.

INSERT INTO "private_company_techniques" ("id","companyId","category","slug","labelAr","labelEn","sortOrder","active","departmentId","createdAt","updatedAt")
SELECT
  md5(concat('pct:qc:', d.id)),
  d."companyId",
  'INSPECTION_QC',
  concat('pc_dept_qc_', d.id),
  d.name,
  concat('Department: ', d.name),
  greatest(0, d."sortOrder") * 10,
  true,
  d.id,
  now(),
  now()
FROM "private_company_departments" d
WHERE NOT EXISTS (
  SELECT 1
  FROM "private_company_techniques" t
  WHERE t."companyId" = d."companyId"
    AND t."category" = 'INSPECTION_QC'
    AND t.slug = concat('pc_dept_qc_', d.id)
);

INSERT INTO "private_company_techniques" ("id","companyId","category","slug","labelAr","labelEn","sortOrder","active","departmentId","createdAt","updatedAt")
SELECT
  md5(concat('pct:m:', d.id)),
  d."companyId",
  'MAINTENANCE',
  concat('pc_dept_m_', d.id),
  d.name,
  concat('Department: ', d.name),
  greatest(0, d."sortOrder") * 10 + 1,
  true,
  d.id,
  now(),
  now()
FROM "private_company_departments" d
WHERE NOT EXISTS (
  SELECT 1
  FROM "private_company_techniques" t
  WHERE t."companyId" = d."companyId"
    AND t."category" = 'MAINTENANCE'
    AND t.slug = concat('pc_dept_m_', d.id)
);
