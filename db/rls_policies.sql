-- ==============================================================================
-- 5-LAYER SECURITY FIREWALL: POSTGRESQL ROW-LEVEL SECURITY (RLS) POLICIES
-- Target: School Management Portal (Next.js + Prisma + PostgreSQL)
-- File: /db/rls_policies.sql
--
-- Isolates "Student", "Attendance", and "Mark" tables by parent_id and teacher_id.
-- Grants full access to ADMIN users.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper Functions to Resolve Request Context (from session variables)
-- ------------------------------------------------------------------------------

-- Get current authenticated User ID (passed via session config: SET LOCAL app.current_user_id = '...')
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get current authenticated User Role (e.g. 'ADMIN', 'TEACHER', 'PARENT', 'STUDENT')
CREATE OR REPLACE FUNCTION current_app_user_role() RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'ANONYMOUS'));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get Parent ID for the current authenticated user
CREATE OR REPLACE FUNCTION current_app_parent_id() RETURNS TEXT AS $$
DECLARE
  p_id TEXT;
BEGIN
  -- First check explicit session variable
  p_id := NULLIF(current_setting('app.current_parent_id', true), '');
  IF p_id IS NOT NULL THEN
    RETURN p_id;
  END IF;

  -- Fallback to querying the Parent record by userId
  SELECT id INTO p_id FROM "Parent" WHERE "userId" = current_app_user_id() LIMIT 1;
  RETURN p_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get Teacher ID for the current authenticated user
CREATE OR REPLACE FUNCTION current_app_teacher_id() RETURNS TEXT AS $$
DECLARE
  t_id TEXT;
BEGIN
  -- First check explicit session variable
  t_id := NULLIF(current_setting('app.current_teacher_id', true), '');
  IF t_id IS NOT NULL THEN
    RETURN t_id;
  END IF;

  -- Fallback to querying the Teacher record by userId
  SELECT id INTO t_id FROM "Teacher" WHERE "userId" = current_app_user_id() LIMIT 1;
  RETURN t_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ==============================================================================
-- 2. "Student" Table RLS Policies
-- ==============================================================================

ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS admin_student_all ON "Student";
DROP POLICY IF EXISTS parent_student_isolation_select ON "Student";
DROP POLICY IF EXISTS teacher_student_isolation_select ON "Student";
DROP POLICY IF EXISTS student_self_isolation_select ON "Student";

-- (A) ADMIN Policy: Full access
CREATE POLICY admin_student_all ON "Student"
  FOR ALL
  USING (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  )
  WITH CHECK (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  );

-- (B) PARENT Policy: Can ONLY view their linked children (via ParentStudent)
CREATE POLICY parent_student_isolation_select ON "Student"
  FOR SELECT
  USING (
    current_app_user_role() = 'PARENT'
    AND "id" IN (
      SELECT ps."studentId"
      FROM "ParentStudent" ps
      WHERE ps."parentId" = current_app_parent_id()
    )
  );

-- (C) TEACHER Policy: Can ONLY view students enrolled in classes they teach or oversee
CREATE POLICY teacher_student_isolation_select ON "Student"
  FOR SELECT
  USING (
    current_app_user_role() = 'TEACHER'
    AND "classId" IN (
      SELECT c."id"
      FROM "Class" c
      WHERE c."teacherId" = current_app_teacher_id()
         OR c."classTeacherId" = current_app_teacher_id()
    )
  );

-- (D) STUDENT Policy: Can ONLY view their own record
CREATE POLICY student_self_isolation_select ON "Student"
  FOR SELECT
  USING (
    current_app_user_role() = 'STUDENT'
    AND (
      "admissionNo" = current_app_user_id()
      OR "id" IN (SELECT "studentId" FROM "User" WHERE "id" = current_app_user_id() AND "studentId" IS NOT NULL)
    )
  );


-- ==============================================================================
-- 3. "Attendance" Table RLS Policies
-- ==============================================================================

ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS admin_attendance_all ON "Attendance";
DROP POLICY IF EXISTS parent_attendance_isolation_select ON "Attendance";
DROP POLICY IF EXISTS teacher_attendance_isolation_all ON "Attendance";
DROP POLICY IF EXISTS student_attendance_isolation_select ON "Attendance";

-- (A) ADMIN Policy: Full access
CREATE POLICY admin_attendance_all ON "Attendance"
  FOR ALL
  USING (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  )
  WITH CHECK (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  );

-- (B) PARENT Policy: Can ONLY view attendance of their linked children
CREATE POLICY parent_attendance_isolation_select ON "Attendance"
  FOR SELECT
  USING (
    current_app_user_role() = 'PARENT'
    AND "studentId" IN (
      SELECT ps."studentId"
      FROM "ParentStudent" ps
      WHERE ps."parentId" = current_app_parent_id()
    )
  );

-- (C) TEACHER Policy: Can view, insert, and update attendance for their assigned classes
CREATE POLICY teacher_attendance_isolation_all ON "Attendance"
  FOR ALL
  USING (
    current_app_user_role() = 'TEACHER'
    AND "classId" IN (
      SELECT c."id"
      FROM "Class" c
      WHERE c."teacherId" = current_app_teacher_id()
         OR c."classTeacherId" = current_app_teacher_id()
    )
  )
  WITH CHECK (
    current_app_user_role() = 'TEACHER'
    AND "classId" IN (
      SELECT c."id"
      FROM "Class" c
      WHERE c."teacherId" = current_app_teacher_id()
         OR c."classTeacherId" = current_app_teacher_id()
    )
  );

-- (D) STUDENT Policy: Can ONLY view their own attendance
CREATE POLICY student_attendance_isolation_select ON "Attendance"
  FOR SELECT
  USING (
    current_app_user_role() = 'STUDENT'
    AND "studentId" IN (
      SELECT s."id" FROM "Student" s WHERE s."admissionNo" = current_app_user_id()
    )
  );


-- ==============================================================================
-- 4. "Mark" (Grades) Table RLS Policies
-- ==============================================================================

ALTER TABLE "Mark" ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS admin_mark_all ON "Mark";
DROP POLICY IF EXISTS parent_mark_isolation_select ON "Mark";
DROP POLICY IF EXISTS teacher_mark_isolation_all ON "Mark";
DROP POLICY IF EXISTS student_mark_isolation_select ON "Mark";

-- (A) ADMIN Policy: Full access
CREATE POLICY admin_mark_all ON "Mark"
  FOR ALL
  USING (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  )
  WITH CHECK (
    current_app_user_role() = 'ADMIN' 
    OR current_user = 'postgres'
  );

-- (B) PARENT Policy: Can ONLY view marks/grades of their linked children
CREATE POLICY parent_mark_isolation_select ON "Mark"
  FOR SELECT
  USING (
    current_app_user_role() = 'PARENT'
    AND "studentId" IN (
      SELECT ps."studentId"
      FROM "ParentStudent" ps
      WHERE ps."parentId" = current_app_parent_id()
    )
  );

-- (C) TEACHER Policy: Can view, record, and edit marks for:
--     1. Marks they specifically entered ("enteredByStaffId" = teacher.id)
--     2. Marks for students in classes they manage as class teacher or subject teacher
CREATE POLICY teacher_mark_isolation_all ON "Mark"
  FOR ALL
  USING (
    current_app_user_role() = 'TEACHER'
    AND (
      "enteredByStaffId" = current_app_teacher_id()
      OR "studentId" IN (
        SELECT s."id"
        FROM "Student" s
        JOIN "Class" c ON s."classId" = c."id"
        WHERE c."teacherId" = current_app_teacher_id()
           OR c."classTeacherId" = current_app_teacher_id()
      )
      OR "subjectId" IN (
        SELECT sub."id"
        FROM "Subject" sub
        WHERE sub."teacherId" = current_app_teacher_id()
      )
    )
  )
  WITH CHECK (
    current_app_user_role() = 'TEACHER'
    AND (
      "enteredByStaffId" = current_app_teacher_id()
      OR "studentId" IN (
        SELECT s."id"
        FROM "Student" s
        JOIN "Class" c ON s."classId" = c."id"
        WHERE c."teacherId" = current_app_teacher_id()
           OR c."classTeacherId" = current_app_teacher_id()
      )
    )
  );

-- (D) STUDENT Policy: Can ONLY view their own marks
CREATE POLICY student_mark_isolation_select ON "Mark"
  FOR SELECT
  USING (
    current_app_user_role() = 'STUDENT'
    AND "studentId" IN (
      SELECT s."id" FROM "Student" s WHERE s."admissionNo" = current_app_user_id()
    )
  );

-- ------------------------------------------------------------------------------
-- 5. Row-Level Security Verification Query
-- ------------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('Student', 'Attendance', 'Mark')
ORDER BY tablename;
