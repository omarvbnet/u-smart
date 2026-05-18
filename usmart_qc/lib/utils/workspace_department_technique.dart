/// Mirrors server [departmentQcTechniqueSlug] / [departmentMaintenanceTechniqueSlug].
String departmentQcTechniqueSlug(String departmentId) =>
    'pc_dept_qc_${departmentId.trim()}';

String departmentMaintenanceTechniqueSlug(String departmentId) =>
    'pc_dept_m_${departmentId.trim()}';
