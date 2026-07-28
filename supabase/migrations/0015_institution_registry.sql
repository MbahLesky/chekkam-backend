-- Phase 11 — Cameroon Trusted Institution Registry + National Verification
-- Directory. Additive only: widens institutions.type to cover the
-- categories the spec asks citizens be able to trust/search (hospitals,
-- banks, telecom operators, councils, courts, police, gendarmerie), on top
-- of the existing ministry/exam_board/school/university/company/ngo/media/
-- civil_registry/other/manufacturer set. No new table — GET /api/institutions
-- and GET /api/institutions/[id] (added this phase) are the "directory";
-- citizens already reach it through the same institutions table admins use
-- to onboard institutions, per the "reuse, don't duplicate" instruction.
alter table institutions drop constraint if exists institutions_type_check;
alter table institutions add constraint institutions_type_check
  check (type in (
    'ministry', 'exam_board', 'school', 'university', 'company', 'ngo',
    'media', 'civil_registry', 'other', 'manufacturer',
    'hospital', 'bank', 'telecom_operator', 'council', 'court',
    'police', 'gendarmerie'
  ));
